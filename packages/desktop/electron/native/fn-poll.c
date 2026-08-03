/*
 * Poll macOS Fn key (virtual key 0x3F) via CGEventSourceKeyState.
 * Prints one line per transition: "down" or "up".
 * Requires Accessibility for reliable global state on some macOS versions.
 */
#include <ApplicationServices/ApplicationServices.h>
#include <stdio.h>
#include <unistd.h>

#define FN_VK 0x3F  /* kVK_Function */

int main(void) {
    int prev = 0;
    setvbuf(stdout, NULL, _IONBF, 0);

    while (1) {
        int down = CGEventSourceKeyState(kCGEventSourceStateHIDSystemState, FN_VK) ? 1 : 0;
        if (down != prev) {
            prev = down;
            puts(down ? "down" : "up");
        }
        usleep(8000); /* ~125 Hz — responsive without burning CPU */
    }
    return 0;
}
