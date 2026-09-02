// `sns-validator` (aws/aws-js-sns-message-validator) ships no types. Only the
// one method used in `services/snsSignature.ts` is declared.
declare module "sns-validator" {
  class MessageValidator {
    constructor(hostPattern?: RegExp, encoding?: string);
    validate(
      hash: Record<string, unknown>,
      cb: (err: Error | null, message?: Record<string, unknown>) => void
    ): void;
  }
  export = MessageValidator;
}
