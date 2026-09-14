export {};

declare global {
  // Compatibility type names share the core UI contract. There is one
  // execution owner and one completion/error schema, not a second overload.
  type OpenDeskUISemanticTapTargetsOptions = OpenDeskUISemanticTapOptions;
  type OpenDeskUISemanticTapTargetsResult = OpenDeskUISemanticTapResult;
  type OpenDeskUISemanticOCRTapCompletion = OpenDeskUITapResult<OpenDeskUITextTarget>;
  type OpenDeskUISemanticAccessibilityTapCompletion = OpenDeskUISemanticTapCompletion;
}
