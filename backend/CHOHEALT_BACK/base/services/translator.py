import logging
from functools import lru_cache
from deep_translator import GoogleTranslator

logger = logging.getLogger(__name__)

DEFAULT_LANGUAGE = 'es'


@lru_cache(maxsize=1024)
def translate_text(text: str, source: str, target: str) -> str:
    """Translate text using Google Translate. Results are cached in memory."""
    if not text or source == target:
        return text
    try:
        return GoogleTranslator(source=source, target=target).translate(text)
    except Exception as e:
        logger.warning(f'Translation failed: {e}')
        return text


def translate_fields(data: dict, fields: list[str], target_lang: str) -> dict:
    """Translate specific fields in a dict from DEFAULT_LANGUAGE to target_lang."""
    if target_lang == DEFAULT_LANGUAGE:
        return data
    for field in fields:
        if field in data and data[field]:
            data[field] = translate_text(data[field], DEFAULT_LANGUAGE, target_lang)
    return data
