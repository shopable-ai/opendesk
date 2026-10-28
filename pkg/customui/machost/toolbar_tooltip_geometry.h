#ifndef OPENDESK_CUSTOMUI_TOOLBAR_TOOLTIP_GEOMETRY_H
#define OPENDESK_CUSTOMUI_TOOLBAR_TOOLTIP_GEOMETRY_H

#import <Cocoa/Cocoa.h>
#include <math.h>

// All geometry is in Cocoa screen points (origin at bottom left).
static const CGFloat CDTooltipGap = 8.0;
static const CGFloat CDTooltipSafetyInset = 6.0;

typedef enum { CDTooltipRight, CDTooltipLeft, CDTooltipTop, CDTooltipBottom } CDTooltipSide;

static inline void CDTooltipSideOrder(BOOL vertical, NSString *preference, CDTooltipSide sides[4]) {
    CDTooltipSide first;
    if ([preference isEqualToString:@"right"]) first = CDTooltipRight;
    else if ([preference isEqualToString:@"left"]) first = CDTooltipLeft;
    else if ([preference isEqualToString:@"top"]) first = CDTooltipTop;
    else if ([preference isEqualToString:@"bottom"]) first = CDTooltipBottom;
    else first = vertical ? CDTooltipRight : CDTooltipBottom;

    sides[0] = first;
    switch (first) {
        case CDTooltipRight: sides[1] = CDTooltipLeft; sides[2] = CDTooltipBottom; sides[3] = CDTooltipTop; break;
        case CDTooltipLeft: sides[1] = CDTooltipRight; sides[2] = CDTooltipBottom; sides[3] = CDTooltipTop; break;
        case CDTooltipTop: sides[1] = CDTooltipBottom; sides[2] = CDTooltipRight; sides[3] = CDTooltipLeft; break;
        case CDTooltipBottom: sides[1] = CDTooltipTop; sides[2] = CDTooltipRight; sides[3] = CDTooltipLeft; break;
    }
}

static inline NSRect CDTooltipAvailableRect(NSRect visible, NSRect bar, CDTooltipSide side) {
    // Clamp empty regions instead of allowing NSInsetRect to invert a tiny screen.
    CGFloat minX = NSMinX(visible) + MIN(CDTooltipSafetyInset, MAX(0.0, visible.size.width) / 2.0);
    CGFloat minY = NSMinY(visible) + MIN(CDTooltipSafetyInset, MAX(0.0, visible.size.height) / 2.0);
    CGFloat maxX = minX + MAX(0.0, visible.size.width - 2.0 * CDTooltipSafetyInset);
    CGFloat maxY = minY + MAX(0.0, visible.size.height - 2.0 * CDTooltipSafetyInset);
    switch (side) {
        case CDTooltipRight: minX = MIN(maxX, MAX(minX, NSMaxX(bar) + CDTooltipGap)); break;
        case CDTooltipLeft: maxX = MAX(minX, MIN(maxX, NSMinX(bar) - CDTooltipGap)); break;
        case CDTooltipTop: minY = MIN(maxY, MAX(minY, NSMaxY(bar) + CDTooltipGap)); break;
        case CDTooltipBottom: maxY = MAX(minY, MIN(maxY, NSMinY(bar) - CDTooltipGap)); break;
        default: return NSZeroRect;
    }
    return NSMakeRect(minX, minY, maxX - minX, maxY - minY);
}

// Failure leaves *frame unchanged. Only the axis perpendicular to the side is clamped.
static inline BOOL CDTooltipPlace(NSRect region, NSRect anchor, NSSize size,
                                  CDTooltipSide side, NSRect *frame) {
    if (!frame || !isfinite(size.width) || !isfinite(size.height) ||
        !(size.width > 0.0) || !(size.height > 0.0) ||
        !(size.width <= region.size.width) || !(size.height <= region.size.height)) return NO;
    CGFloat x, y;
    switch (side) {
        case CDTooltipRight:
        case CDTooltipLeft:
            x = side == CDTooltipRight ? NSMinX(region) : MAX(NSMinX(region), NSMaxX(region) - size.width);
            y = MIN(MAX(NSMidY(anchor) - size.height / 2.0, NSMinY(region)),
                    MAX(NSMinY(region), NSMaxY(region) - size.height));
            break;
        case CDTooltipTop:
        case CDTooltipBottom:
            x = MIN(MAX(NSMidX(anchor) - size.width / 2.0, NSMinX(region)),
                    MAX(NSMinX(region), NSMaxX(region) - size.width));
            y = side == CDTooltipTop ? NSMinY(region) : MAX(NSMinY(region), NSMaxY(region) - size.height);
            break;
        default: return NO;
    }
    NSRect candidate = NSMakeRect(x, y, size.width, size.height);
    if (!isfinite(x) || !isfinite(y) || !NSContainsRect(region, candidate)) return NO;
    *frame = candidate;
    return YES;
}

#endif
