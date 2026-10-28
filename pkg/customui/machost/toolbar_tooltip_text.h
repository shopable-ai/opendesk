#ifndef OPENDESK_CUSTOMUI_TOOLBAR_TOOLTIP_TEXT_H
#define OPENDESK_CUSTOMUI_TOOLBAR_TOOLTIP_TEXT_H

#import <Cocoa/Cocoa.h>
#import <CoreText/CoreText.h>
#include <math.h>

// Match NSString layout to the native text field, including its cell inset.
static inline NSSize CDToolbarTooltipSize(NSString *text, CGFloat maximumWidth) {
 if (!text.length || !isfinite(maximumWidth)) return NSZeroSize;
 CGFloat glyphWidth = MIN(300.0, maximumWidth - 28.0);
 if (glyphWidth < 12.0) return NSZeroSize;
 NSMutableParagraphStyle *paragraph = [NSMutableParagraphStyle new];
 paragraph.lineBreakMode = NSLineBreakByWordWrapping;
 NSFont *font = [NSFont systemFontOfSize:12.0];
 NSDictionary *attributes = @{NSFontAttributeName: font, NSParagraphStyleAttributeName: paragraph};
 // Constrained NSString measurement can report the container width even
 // when a single indivisible glyph is wider. Never accept such a clipped fit.
 __block BOOL complete = YES;
 [text enumerateSubstringsInRange:NSMakeRange(0, text.length)
  options:NSStringEnumerationByComposedCharacterSequences
  usingBlock:^(NSString *cluster, NSRange range, NSRange enclosing, BOOL *stop) {
   (void)range; (void)enclosing;
   NSAttributedString *run = [[NSAttributedString alloc] initWithString:cluster attributes:attributes];
   CTLineRef line = CTLineCreateWithAttributedString((__bridge CFAttributedStringRef)run);
   CGRect ink = CTLineGetImageBounds(line, NULL);
   CGFloat ascent = 0.0, descent = 0.0;
   CGFloat advance = (CGFloat)CTLineGetTypographicBounds(line, &ascent, &descent, NULL);
   CFRelease(line);
   // Empty/whitespace runs have no ink. Their advance still needs to fit.
   if (CGRectIsNull(ink) || CGRectIsEmpty(ink)) ink = CGRectZero;
   CGFloat left = MIN(0.0, CGRectGetMinX(ink));
   CGFloat right = MAX(advance, CGRectGetMaxX(ink));
   // NSTextField's cell inset and extra two vertical points cover ordinary
   // bearings. Pathological stacked marks can escape the native line box;
   // suppress those runs rather than claim a fit that clips visible ink.
   if (ceil(right - left) > glyphWidth || left < -2.0 || right > advance + 2.0 ||
    CGRectGetMaxY(ink) > ceil(ascent) + 1.0 ||
    CGRectGetMinY(ink) < -ceil(descent) - 1.0) {
    complete = NO; *stop = YES;
   }
  }];
 if (!complete) return NSZeroSize;
 NSRect measured = [text boundingRectWithSize:NSMakeSize(glyphWidth, CGFLOAT_MAX)
  options:NSStringDrawingUsesLineFragmentOrigin | NSStringDrawingUsesFontLeading attributes:attributes];
 return NSMakeSize(MIN(maximumWidth, ceil(NSWidth(measured)) + 28.0), MAX(15.0, ceil(NSHeight(measured)) + 2.0) + 12.0);
}

#endif
