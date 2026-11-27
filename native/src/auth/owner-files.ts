/* The kept photo files live in core/owner-files.ts, which touches only the phone's own files, so the phone-only build
   can load it too (metro.config.js puts it in place of this file there). Sign-out and Settings import it from here. */
export * from '../core/owner-files';
