import path from "node:path";
import { directory, readJSON, atomicJSON } from "./storage.mjs";

export const VOICE_PASSAGE =
  "Hello, this is my natural speaking voice. I am recording a short sample for my assistant. I would like clear, calm replies that are easy to understand. Today I am checking the setup before beginning my work.";

export function sampleGuide() {
  return `Please record a clear voice note of your own voice. Recommended: read this short passage, about twenty seconds at a natural pace:\n\n${VOICE_PASSAGE}\n\nUse a quiet place, one speaker, no music, and your normal volume and pace. A clear first ordinary voice message is also an option after you enable voice. Check the actual transcript and listen to the generated preview; if either is wrong, ask the agent to correct it or help you record again. The transcript must match what you actually spoke, not a translation. Text remains available.`;
}

export function pairingGuide() {
  return `Paired for text. If you continue with text, your agent replies in text and no sample or speech download is needed.\n\nIf you want voice replies, enable optional local speech first: npm run telegram -- install-voice. This downloads local models and requires Python and FFmpeg. You can instead ask the dashboard agent to help after it starts. Restart the listener after speech installation.\n\n${sampleGuide()}\n\nOnly the paired owner can enroll. The private sample stays on this computer, is reused for replies, and is not committed to your repository. Use /voice-sample followed by another recording when you intentionally want to replace it.`;
}

export async function deliverPairingGuide(root, api, config) {
  const file = path.join(directory(root), "onboarding-message.json");
  const previous = readJSON(file, null);
  // An uncertain network outcome may already have delivered the guide. The
  // terminal always shows it, so never duplicate a message by retrying blindly.
  if (previous) return previous;
  atomicJSON(file, { status: "sending", at: new Date().toISOString() });
  try {
    const response = await api.sendText(pairingGuide(), config);
    if (!Number.isSafeInteger(response?.message_id)) throw { uncertain: true };
    const receipt = {
      status: "confirmed",
      messageId: response.message_id,
      at: new Date().toISOString(),
    };
    atomicJSON(file, receipt);
    return receipt;
  } catch (error) {
    const receipt = {
      status: error.uncertain ? "indeterminate" : "failed",
      reason:
        "Telegram onboarding guide was not confirmed; use the guide printed in the terminal. Inspect the paired chat before any retry.",
      at: new Date().toISOString(),
    };
    atomicJSON(file, receipt);
    return receipt;
  }
}
