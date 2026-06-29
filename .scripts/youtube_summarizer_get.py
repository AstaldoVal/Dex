#!/usr/bin/env python3
"""Get full transcript text for a YouTube video. Usage: python3 script.py VIDEO_ID [output_path]"""
import sys
from youtube_transcript_api import YouTubeTranscriptApi

video_id = sys.argv[1]
out_path = sys.argv[2] if len(sys.argv) > 2 else f"/tmp/transcript_{video_id}.txt"

api = YouTubeTranscriptApi()
fetched = api.fetch(video_id)
parts = [s.text for s in fetched]
full_text = " ".join(parts)

with open(out_path, "w") as f:
    f.write(full_text)

print(out_path)
print(len(full_text))
