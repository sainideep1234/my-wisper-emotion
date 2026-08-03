#include <ApplicationServices/ApplicationServices.h>
#include <unistd.h>

int main() {
    if (!AXIsProcessTrusted()) {
        return 1;
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
    return 0;
}
