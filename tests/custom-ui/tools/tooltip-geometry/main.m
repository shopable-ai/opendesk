#import "pkg/customui/machost/toolbar_tooltip_geometry.h"
#import "pkg/customui/machost/toolbar_tooltip_text.h"
#include <stdio.h>
#include <stdlib.h>

static NSUInteger assertions = 0, placements = 0;
#define CHECK(condition) do { assertions++; if (!(condition)) { \
    fprintf(stderr, "FAIL line %d: %s\n", __LINE__, #condition); exit(1); \
} } while (0)

static void CheckRect(NSRect actual, NSRect expected) {
    CHECK(NSEqualRects(actual, expected));
}

static void CheckOrder(BOOL vertical, NSString *preference, CDTooltipSide a,
                       CDTooltipSide b, CDTooltipSide c, CDTooltipSide d) {
    CDTooltipSide sides[4];
    CDTooltipSideOrder(vertical, preference, sides);
    CHECK(sides[0] == a && sides[1] == b && sides[2] == c && sides[3] == d);
}

static void Orders(void) {
    for (int vertical = 0; vertical <= 1; vertical++) {
        CheckOrder(vertical, @"right", CDTooltipRight, CDTooltipLeft, CDTooltipBottom, CDTooltipTop);
        CheckOrder(vertical, @"left", CDTooltipLeft, CDTooltipRight, CDTooltipBottom, CDTooltipTop);
        CheckOrder(vertical, @"top", CDTooltipTop, CDTooltipBottom, CDTooltipRight, CDTooltipLeft);
        CheckOrder(vertical, @"bottom", CDTooltipBottom, CDTooltipTop, CDTooltipRight, CDTooltipLeft);
        for (NSString *preference in @[@"auto", @"", @"unknown"]) {
            if (vertical) CheckOrder(YES, preference, CDTooltipRight, CDTooltipLeft, CDTooltipBottom, CDTooltipTop);
            else CheckOrder(NO, preference, CDTooltipBottom, CDTooltipTop, CDTooltipRight, CDTooltipLeft);
        }
    }
    CheckOrder(YES, nil, CDTooltipRight, CDTooltipLeft, CDTooltipBottom, CDTooltipTop);
    CheckOrder(NO, nil, CDTooltipBottom, CDTooltipTop, CDTooltipRight, CDTooltipLeft);
}

static void Boundaries(void) {
    CHECK(CDTooltipGap == 8.0 && CDTooltipSafetyInset == 6.0);
    NSRect visible = NSMakeRect(-100, -50, 400, 300), bar = NSMakeRect(50, 40, 40, 80);
    NSRect expected[] = { NSMakeRect(98, -44, 196, 288), NSMakeRect(-94, -44, 136, 288),
                          NSMakeRect(-94, 128, 388, 116), NSMakeRect(-94, -44, 388, 76) };
    for (CDTooltipSide side = CDTooltipRight; side <= CDTooltipBottom; side++) {
        NSRect region = CDTooltipAvailableRect(visible, bar, side), frame;
        CheckRect(region, expected[side]);
        CHECK(CDTooltipPlace(region, bar, NSMakeSize(20, 10), side, &frame));
        if (side == CDTooltipRight) CheckRect(frame, NSMakeRect(98, 75, 20, 10));
        if (side == CDTooltipLeft) CheckRect(frame, NSMakeRect(22, 75, 20, 10));
        if (side == CDTooltipTop) CheckRect(frame, NSMakeRect(60, 128, 20, 10));
        if (side == CDTooltipBottom) CheckRect(frame, NSMakeRect(60, 22, 20, 10));
        CHECK(CDTooltipPlace(region, bar, region.size, side, &frame));
        CheckRect(frame, region); // Exact fits must be accepted.
        NSRect sentinel = NSMakeRect(1, 2, 3, 4);
        NSSize invalid[] = { NSMakeSize(region.size.width + 0.25, 1),
            NSMakeSize(1, region.size.height + 0.25), NSMakeSize(0, 1), NSMakeSize(1, 0),
            NSMakeSize(-1, 1), NSMakeSize(1, -1), NSMakeSize(NAN, 1), NSMakeSize(1, INFINITY) };
        for (NSUInteger i = 0; i < sizeof(invalid) / sizeof(invalid[0]); i++) {
            frame = sentinel;
            CHECK(!CDTooltipPlace(region, bar, invalid[i], side, &frame));
            CheckRect(frame, sentinel);
        }
        CHECK(!CDTooltipPlace(region, bar, NSMakeSize(1, 1), side, NULL));
        NSRect tiny = CDTooltipAvailableRect(NSMakeRect(-3, -2, 5, 4), bar, side);
        CHECK(tiny.size.width == 0 && tiny.size.height == 0);
        CHECK(!CDTooltipPlace(tiny, bar, NSMakeSize(0.25, 0.25), side, &frame));
        NSRect blocked = CDTooltipAvailableRect(visible, NSMakeRect(-10000, -10000, 20000, 20000), side);
        CHECK(blocked.size.width == 0 || blocked.size.height == 0);
        CHECK(!CDTooltipPlace(blocked, bar, NSMakeSize(1, 1), side, &frame));
    }
    // Fractional logical points must survive placement without pixel/integer rounding.
    NSRect region = NSMakeRect(-97.75, -51.5, 80.5, 70.25), frame;
    NSRect anchor = NSMakeRect(-100, -40.25, 10.5, 11.25);
    CHECK(CDTooltipPlace(region, anchor, NSMakeSize(20.25, 10.5), CDTooltipRight, &frame));
    CheckRect(frame, NSMakeRect(-97.75, -39.875, 20.25, 10.5));
    // A non-dyadic exact boundary cannot be rounded beyond its safe region.
    region = NSMakeRect(0.1, 0.2, 40.3, 20.4);
    CHECK(CDTooltipPlace(region, region, region.size, CDTooltipRight, &frame));
    CHECK(NSContainsRect(region, frame));
}

static void Fallbacks(void) {
    // Isolate each successive candidate: all preceding sides have less than 20pt room.
    NSRect visible = NSMakeRect(0, 0, 200, 200);
    for (int vertical = 0; vertical <= 1; vertical++) {
        for (NSString *preference in @[@"auto", @"right", @"left", @"top", @"bottom"]) {
            CDTooltipSide sides[4];
            CDTooltipSideOrder(vertical, preference, sides);
            for (int target = 0; target < 4; target++) {
                CGFloat left = 50, right = 150, bottom = 50, top = 150;
                for (int i = 0; i < target; i++) {
                    switch (sides[i]) {
                        case CDTooltipRight: right = 190; break;
                        case CDTooltipLeft: left = 10; break;
                        case CDTooltipTop: top = 190; break;
                        case CDTooltipBottom: bottom = 10; break;
                    }
                }
                NSRect bar = NSMakeRect(left, bottom, right - left, top - bottom), frame;
                int chosen = -1;
                for (int i = 0; i < 4; i++) {
                    if (CDTooltipPlace(CDTooltipAvailableRect(visible, bar, sides[i]), bar,
                                       NSMakeSize(20, 20), sides[i], &frame)) { chosen = i; break; }
                }
                CHECK(chosen == target);
            }
        }
    }
}

static void PropertyGrid(void) {
    const CGFloat offsets[] = { -1920.5, -0.25, 0, 100.75 };
    const CGFloat positions[] = { -0.25, 0, 0.5, 1, 1.25 };
    const NSSize screens[] = { { 10, 11 }, { 12, 12 }, { 12.5, 13 }, { 160, 120 }, { 1440.5, 900.25 } };
    const NSSize bars[] = { { 20.5, 60.25 }, { 80.25, 18.5 }, { 4000, 3000 } };
    for (NSUInteger o = 0; o < sizeof(offsets) / sizeof(offsets[0]); o++)
    for (NSUInteger s = 0; s < sizeof(screens) / sizeof(screens[0]); s++)
    for (NSUInteger b = 0; b < sizeof(bars) / sizeof(bars[0]); b++)
    for (NSUInteger px = 0; px < sizeof(positions) / sizeof(positions[0]); px++)
    for (NSUInteger py = 0; py < sizeof(positions) / sizeof(positions[0]); py++) {
        NSRect visible = NSMakeRect(offsets[o], offsets[o] / 2, screens[s].width, screens[s].height);
        NSRect bar = NSMakeRect(visible.origin.x + positions[px] * (screens[s].width - bars[b].width),
                               visible.origin.y + positions[py] * (screens[s].height - bars[b].height),
                               bars[b].width, bars[b].height);
        NSRect anchors[] = { bar, NSMakeRect(NSMinX(bar), NSMinY(bar), 1, 1),
            NSMakeRect(NSMaxX(bar) - 1, NSMaxY(bar) - 1, 1, 1) };
        for (CDTooltipSide side = CDTooltipRight; side <= CDTooltipBottom; side++) {
            NSRect region = CDTooltipAvailableRect(visible, bar, side);
            CHECK(region.size.width >= 0 && region.size.height >= 0);
            NSSize sizes[] = { { 0.25, 0.5 }, { 24.5, 12.25 }, { 100, 40 }, region.size,
                               { region.size.width + 0.25, 1 }, { 1, region.size.height + 0.25 } };
            for (NSUInteger a = 0; a < sizeof(anchors) / sizeof(anchors[0]); a++)
            for (NSUInteger z = 0; z < sizeof(sizes) / sizeof(sizes[0]); z++) {
                NSSize size = sizes[z];
                NSRect frame = NSMakeRect(1, 2, 3, 4);
                BOOL fits = size.width > 0 && size.height > 0 &&
                    size.width <= region.size.width && size.height <= region.size.height;
                CHECK(CDTooltipPlace(region, anchors[a], size, side, &frame) == fits);
                if (!fits) { CheckRect(frame, NSMakeRect(1, 2, 3, 4)); continue; }
                placements++;
                CHECK(NSEqualSizes(frame.size, size));
                CHECK(NSContainsRect(region, frame));
                CHECK(NSContainsRect(NSInsetRect(visible, 6, 6), frame));
                CHECK(!NSIntersectsRect(bar, frame));
                switch (side) {
                    case CDTooltipRight:
                        CHECK(NSMinX(frame) >= NSMaxX(bar) + 8);
                        CHECK(NSMinX(frame) == NSMinX(region)); break;
                    case CDTooltipLeft:
                        CHECK(NSMaxX(frame) <= NSMinX(bar) - 8);
                        CHECK(NSMaxX(frame) == NSMaxX(region)); break;
                    case CDTooltipTop:
                        CHECK(NSMinY(frame) >= NSMaxY(bar) + 8);
                        CHECK(NSMinY(frame) == NSMinY(region)); break;
                    case CDTooltipBottom:
                        CHECK(NSMaxY(frame) <= NSMinY(bar) - 8);
                        CHECK(NSMaxY(frame) == NSMaxY(region)); break;
                }
                // Independent centering oracle: an unclamped center equals the anchor;
                // otherwise the nearest perpendicular region edge must be touched.
                if (side == CDTooltipRight || side == CDTooltipLeft) {
                    CGFloat centered = NSMidY(anchors[a]) - size.height / 2;
                    if (centered < NSMinY(region)) CHECK(NSMinY(frame) == NSMinY(region));
                    else if (centered + size.height > NSMaxY(region)) CHECK(NSMaxY(frame) == NSMaxY(region));
                    else CHECK(NSMidY(frame) == NSMidY(anchors[a]));
                } else {
                    CGFloat centered = NSMidX(anchors[a]) - size.width / 2;
                    if (centered < NSMinX(region)) CHECK(NSMinX(frame) == NSMinX(region));
                    else if (centered + size.width > NSMaxX(region)) CHECK(NSMaxX(frame) == NSMaxX(region));
                    else CHECK(NSMidX(frame) == NSMidX(anchors[a]));
                }
            }
        }
    }
    CHECK(placements > 10000);
}

static void TextMeasurement(void) {
    NSString *above = [@"a" stringByPaddingToLength:21 withString:@"́" startingAtIndex:0];
    NSString *below = [@"a" stringByPaddingToLength:21 withString:@"̠" startingAtIndex:0];
    CHECK(NSEqualSizes(CDToolbarTooltipSize(above, 328.0), NSZeroSize));
    CHECK(NSEqualSizes(CDToolbarTooltipSize(below, 328.0), NSZeroSize));
    CHECK(CDToolbarTooltipSize(@"café，常用中文", 328.0).width > 28.0);
    CHECK(NSEqualSizes(CDToolbarTooltipSize(@"﷽", 40.0), NSZeroSize));
    CHECK(NSEqualSizes(CDToolbarTooltipSize(@"", 328.0), NSZeroSize));
    CHECK(NSEqualSizes(CDToolbarTooltipSize(@"审阅", NAN), NSZeroSize));
    // This fallback glyph also descends beyond its typographic line box;
    // a wider container alone cannot make the native label safe to render.
    CHECK(NSEqualSizes(CDToolbarTooltipSize(@"﷽", 328.0), NSZeroSize));
    NSSize natural = CDToolbarTooltipSize(@"👩‍👩‍👧‍👦", 328.0);
    CHECK(natural.width >= 45.0 && natural.height >= 27.0);
    NSSize chinese = CDToolbarTooltipSize(@"请审阅当前变更并报告验证结果以及剩余风险", 100.0);
    CHECK(chinese.width <= 100.0 && chinese.height > 40.0);
    NSSize latin = CDToolbarTooltipSize(@"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 100.0);
    CHECK(latin.width <= 100.0 && latin.height > 40.0);
    NSSize multiline = CDToolbarTooltipSize(@"第一行\n第二行\n第三行", 328.0);
    CHECK(multiline.height > 45.0);
    // ZWJ emoji remains one indivisible composed sequence at narrow widths.
    CHECK(NSEqualSizes(CDToolbarTooltipSize(@"👩‍👩‍👧‍👦", 40.0), NSZeroSize));
    for (NSString *text in @[@"﷽", @"👩‍👩‍👧‍👦", @"W", @"审", @"é"]) {
        NSSize full = CDToolbarTooltipSize(text, 328.0);
        for (CGFloat width = 29; width < 100; width += 0.5) {
            NSSize size = CDToolbarTooltipSize(text, width);
            CHECK(NSEqualSizes(size, NSZeroSize) || (size.width <= width && size.width >= full.width));
        }
    }
}

int main(void) {
    @autoreleasepool {
        Orders(); Boundaries(); Fallbacks(); PropertyGrid(); TextMeasurement();
        printf("PASS tooltip geometry: %lu assertions, %lu placements\n",
               (unsigned long)assertions, (unsigned long)placements);
    }
    return 0;
}
