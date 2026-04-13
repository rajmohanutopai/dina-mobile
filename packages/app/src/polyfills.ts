/**
 * AI SDK polyfills for React Native.
 *
 * Must be imported before any AI SDK usage.
 * Required: structuredClone, TextEncoderStream, TextDecoderStream.
 */

import { Platform } from 'react-native';

if (Platform.OS !== 'web') {
  // structuredClone polyfill
  if (typeof globalThis.structuredClone === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sc = require('@ungap/structured-clone');
    globalThis.structuredClone = sc.default ?? sc;
  }

  // TextEncoderStream / TextDecoderStream polyfills
  if (typeof globalThis.TextEncoderStream === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const streams = require('@stardazed/streams-text-encoding');
    globalThis.TextEncoderStream = streams.TextEncoderStream;
    globalThis.TextDecoderStream = streams.TextDecoderStream;
  }
}
