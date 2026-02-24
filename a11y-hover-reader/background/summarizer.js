/**
 * Minimal mock implementation for local summarizer.
 * Provides a highly structural summary that chunks the text locally.
 */
export function summarizeTextLocal(text) {
    if (!text) return "No text provided.";

    const words = text.split(/\s+/);
    if (words.length <= 15) return text; // Too short to summarize

    // Simple extractive mock: grab the first and last sentence
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    if (sentences.length <= 2) {
        return text;
    }

    // Chunking logic simulation
    const intro = sentences[0].trim();
    const outro = sentences[sentences.length - 1].trim();

    return `Local Summary: ${intro} ... ${outro}`;
}
