import torch, json, os
from transformers import AutoModelForAudioClassification, AutoFeatureExtractor

MODEL = "superb/wav2vec2-base-superb-er"
OUT = os.path.dirname(os.path.abspath(__file__))

# Keep this export fp32. Quantizing looks like an obvious win on a 361 MB model
# and is not — measured on Apple Silicon, ONNX Runtime CPU EP:
#
#   fp32   361 MB   77 ms @3s   207 ms @8s   +538 MB peak   (shipped)
#   int8    95 MB  206 ms @3s          —     +289 MB peak   40% of labels change
#   fp16   181 MB        —             —           —        won't load on CPU EP
#
# int8 is 2.7x SLOWER here: quantize/dequantize overhead beats ARM's optimized
# fp32 kernels. And it disagreed with fp32 on 12 of 20 utterances — on a model
# whose real ceiling is ~62% accuracy on 4 classes, that is near-noise.

model = AutoModelForAudioClassification.from_pretrained(MODEL)
fe = AutoFeatureExtractor.from_pretrained(MODEL)
model.config.output_hidden_states = False
model.config.output_attentions = False
model.eval()

class LogitsOnly(torch.nn.Module):
    """The raw export emitted every hidden state as an output, bloating the
    graph. Only the logits are needed."""
    def __init__(self, m): 
        super().__init__(); self.m = m
    def forward(self, input_values):
        return self.m(input_values=input_values).logits

wrapped = LogitsOnly(model).eval()
dummy = torch.randn(1, 16000 * 3)

torch.onnx.export(
    wrapped, (dummy,), os.path.join(OUT, "emotion_legacy.onnx"),
    input_names=["input_values"], output_names=["logits"],
    dynamic_axes={"input_values": {0: "batch", 1: "samples"}, "logits": {0: "batch"}},
    opset_version=17, do_constant_folding=True, external_data=False, dynamo=False,
)

json.dump({
    "model": MODEL,
    "labels": [model.config.id2label[i] for i in range(model.config.num_labels)],
    "sampling_rate": fe.sampling_rate,
    "do_normalize": bool(fe.do_normalize),
}, open(os.path.join(OUT, "emotion_meta.json"), "w"), indent=2)
print("OK labels:", [model.config.id2label[i] for i in range(model.config.num_labels)])
