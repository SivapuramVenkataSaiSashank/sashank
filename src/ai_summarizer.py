"""
ai_summarizer.py
Groq AI integration for document summarization and Q&A.
Uses llama-3.3-70b-versatile via the Groq SDK.
"""
import threading
from typing import Optional, Any


class AISummarizer:
    MODEL_NAME = "llama-3.1-8b-instant"
    MAX_CONTEXT = 10000  # characters sent to Groq

    def __init__(self):
        self._api_key: Optional[str] = None
        self._client: Optional[Any] = None
        self._last_summary = ""
        self._lock = threading.Lock()

    # ─────────────────── Setup ───────────────────

    def set_api_key(self, key: str) -> bool:
        """Initialize Groq client with the given API key. Returns True on success."""
        key = key.strip()
        if not key or key == "your_groq_api_key_here":
            return False
        try:
            from groq import Groq
            client = Groq(api_key=key)
            self._client = client
            self._api_key = key
            return True
        except Exception as e:
            self._client = None
            self._api_key = None
            print(f"[AISummarizer] Groq init error: {e}")
            return False

    def is_ready(self) -> bool:
        return self._client is not None

    # ─────────────────── Summarize ───────────────────

    def summarize(self, text: str, length: str = "medium") -> str:
        if not self.is_ready():
            return "⚠️ Groq API not configured. Please set GROQ_API_KEY in .env"

        length_map = {
            "short":    "2-3 sentences",
            "medium":   "1-2 short paragraphs (5-8 sentences)",
            "detailed": "3-5 detailed paragraphs",
        }
        instruction = length_map.get(length, length_map["medium"])
        """
        prompt = (
            f"You are an AI assistant helping a visually impaired learner understand a document.\n"
            f"Summarize the following text in {instruction}. "
            f"Use simple, clear language. Be informative and accurate.\n\n"
            f"Document content:\n{text[:self.MAX_CONTEXT]}"
        )
"""
        prompt = (
            f"You are an AI assistant helping a visually impaired learner understand information through audio.\n"
            f"Respond as quickly as possible while remaining accurate.\n"
            f"Keep responses concise unless the user explicitly asks for detail.\n"
            f"Stop the response immediately once the answer is complete.\n\n"

            f"All responses are spoken aloud and must be easy to follow by listening only.\n\n"

            f"Follow these rules strictly:\n"
            f"1. If a document is provided, use it as the primary source.\n"
            f"2. If the answer is fully present in the document, respond using only the document.\n"
            f"3. If the user asks for explanation or meaning, first state what the document says, then explain clearly.\n"
            f"4. If no document is provided, answer using accurate general knowledge.\n"
            f"5. If the information is missing or cannot be confirmed, say so briefly and stop.\n"
            f"6. Adapt language complexity to the user's question.\n"
    f"7. Use clear, natural, spoken-style sentences.\n"
    f"8. Do not use visual formatting, symbols, or filler phrases.\n\n"

    f"User request:\n{instruction}\n\n"
    f"Document content:\n{text[:self.MAX_CONTEXT]}"
)
        try:
            with self._lock:
                response = self._client.chat.completions.create(
                    model=self.MODEL_NAME,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.4,
                    max_tokens=1024,
                    stream=True,
                )
            for chunk in response:
                if chunk.choices[0].delta.content is not None:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            yield f"⚠️ Summarization failed: {e}"

    # ─────────────────── Q&A ───────────────────

    def ask(self, question: str, context_text: str, history: list[dict] = None) -> str:
        """Answer a question based on document context and previous chat history."""
        if not self.is_ready():
            return "⚠️ Groq API not configured."
            
        history = history or []
        system_prompt = (
            f"You are an AI reading assistant for a visually impaired learner.\n"
            f"All responses are spoken aloud and must be easy to understand by listening only.\n\n"

            f"Primary task:\n"
            f"- Answer the user's question using ONLY the document excerpt below.\n"
            f"- If the user asks for the meaning of a word, phrase, or concept found in the document, "
            f"you MAY use general knowledge to explain it in the document’s context.\n"
            f"- If the question is unrelated to the document, politely decline.\n\n"

            f"Response rules:\n"
            f"- Use simple, clear, audio-friendly language.\n"
            f"- Avoid visual references like 'see above' or 'as shown'.\n"
            f"- Explain acronyms when first used.\n"
            f"- Give bullet points if user asks in bullet points one point below the other.\n"
            f"- Keep responses concise unless the user asks for more detail.\n\n"

            f"Summaries & structure:\n"
            f"- If the user asks for a summary, provide it clearly.\n"
            f"- If the user asks for bullet points or a specific number of points:\n"
            f"  • ALWAYS follow the exact number requested.\n"
            f"  • Use short, spoken-friendly bullet points.\n"
            f"  • Do NOT add extra points.\n\n"

            f"Accuracy & safety:\n"
            f"- Do not invent information.\n"
            f"- If the answer is not in the document, say:\n"
            f"  'I could not find this information in the provided document.'\n\n"

            f"Voice-command handling:\n"
    f"- Assume spoken or incomplete commands.\n"
    f"- Infer intent when possible.\n"
    f"- Ask one short clarification question if needed.\n\n"

    f"Document:\n{context_text[:self.MAX_CONTEXT]}"
)
        messages = [{"role": "system", "content": system_prompt}]
        for msg in history:
            # Ensure we only pass valid roles
            if msg.get("role") in ["user", "assistant"]:
                messages.append({"role": msg["role"], "content": msg["content"]})
                
        messages.append({"role": "user", "content": question})

        try:
            with self._lock:
                response = self._client.chat.completions.create(
                    model=self.MODEL_NAME,
                    messages=messages,
                    temperature=0.3,
                    max_tokens=1536,
                    stream=True,
                )
            for chunk in response:
                if chunk.choices[0].delta.content is not None:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            yield f"⚠️ Could not answer: {e}"

    def contextualize_query(self, question: str, history: list[dict] = None) -> str:
        """
        Rewrite a user's question to be standalone, based on previous chat history.
        This ensures ChromaDB vector searches can accurately find context for follow-up questions
        like 'What does it mean?' or 'Why did they say that?'.
        """
        if not self.is_ready():
            return question
            
        history = history or []
        # If there is no history, the question is already standalone
        if not history:
            return question

        system_prompt = (
            "You are a strict query reformulator. "
            "Given a chat history and the latest user query, your ONLY job is to rewrite the latest user query "
            "into a standalone searchable question that retains all context from the history.\n\n"
            "CRITICAL RULES:\n"
            "1. DO NOT answer the question.\n"
            "2. DO NOT say 'I don't have information'.\n"
            "3. ONLY return the rewritten standalone query.\n"
            "4. If the query is already standalone, return it exactly as is."
        )
        
        messages = [{"role": "system", "content": system_prompt}]
        for msg in history:
            if msg.get("role") in ["user", "assistant"]:
                # Limit history length to prevent overwhelming the contextualizer
                messages.append({"role": msg["role"], "content": msg["content"]})
                
        # Keep only the last 4 messages (2 exchanges) to save tokens and focus on immediate context
        if len(messages) > 5:
            messages = [messages[0]] + messages[-4:]
            
        messages.append({"role": "user", "content": question})

        try:
            with self._lock:
                response = self._client.chat.completions.create(
                    model=self.MODEL_NAME,
                    messages=messages,
                    temperature=0.2, # Low temperature for more deterministic/factual rewriting
                    max_tokens=256,
                    stream=False,
                )
            
            rewritten_query = response.choices[0].message.content.strip()
            print(f"[AISummarizer] Rewrote query: '{question}' -> '{rewritten_query}'")
            return rewritten_query
        except Exception as e:
            print(f"[AISummarizer] Contextualize error: {e}")
            return question

    # ─────────────────── Async wrappers ───────────────────

    def summarize_async(self, text: str, length: str, callback):
        def worker():
            result = self.summarize(text, length)
            callback(result)
        threading.Thread(target=worker, daemon=True).start()

    def ask_async(self, question: str, context_text: str, callback):
        def worker():
            result = self.ask(question, context_text)
            callback(result)
        threading.Thread(target=worker, daemon=True).start()

    def get_last_summary(self) -> str:
        return self._last_summary
