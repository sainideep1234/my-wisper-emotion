#include <node_api.h>
#include <ApplicationServices/ApplicationServices.h>
#include <unistd.h>

napi_value Paste(napi_env env, napi_callback_info info) {
    napi_status status;
    napi_value result;

    if (!AXIsProcessTrusted()) {
        status = napi_get_boolean(env, false, &result);
        return result;
    }

    CGEventSourceRef src = CGEventSourceCreate(kCGEventSourceStateCombinedSessionState);
    CGEventRef down = CGEventCreateKeyboardEvent(src, (CGKeyCode)9, true); // 'v' keycode
    CGEventRef up = CGEventCreateKeyboardEvent(src, (CGKeyCode)9, false);
    
    CGEventSetFlags(down, kCGEventFlagMaskCommand);
    CGEventSetFlags(up, kCGEventFlagMaskCommand);
    
    CGEventPost(kCGHIDEventTap, down);
    usleep(10000);
    CGEventPost(kCGHIDEventTap, up);
    
    CFRelease(down);
    CFRelease(up);
    CFRelease(src);
    
    status = napi_get_boolean(env, true, &result);
    return result;
}

napi_value Init(napi_env env, napi_value exports) {
    napi_status status;
    napi_value fn;
    
    status = napi_create_function(env, NULL, 0, Paste, NULL, &fn);
    if (status != napi_ok) return NULL;
    
    status = napi_set_named_property(env, exports, "paste", fn);
    if (status != napi_ok) return NULL;
    
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
