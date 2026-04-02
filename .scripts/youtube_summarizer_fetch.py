#!/usr/bin/env python3
"""Fetch YouTube transcript and list availability. Usage: python3 script.py VIDEO_ID"""
import sys
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound

video_id = sys.argv[1]

try:
    transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
    print("OK")
    for t in transcript_list:
        print(f"LANG:{t.language_code}:generated={t.is_generated}")
except TranscriptsDisabled:
    print("ERR:TranscriptsDisabled")
    sys.exit(1)
except NoTranscriptFound:
    print("ERR:NoTranscriptFound")
    sys.exit(1)
except Exception as e:
    print(f"ERR:{e}")
    sys.exit(1)
