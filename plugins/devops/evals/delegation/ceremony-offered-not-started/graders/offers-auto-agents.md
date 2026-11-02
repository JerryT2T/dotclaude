---
type: regex
pattern: '"role":"assistant".*"type":"text","text":"(?:[^"\\]|\\.)*(?<!(?:n.t|not|never|nicht|kein|keine|ohne|without|no)\s(?:\w+\s){0,2})(?:(?:auto|run)-agents|[Aa]gent(?:en)?-?(?:[Ll]auf|[Dd]urchlauf|[Oo]rchestrierung|[Tt]eam|run)|[Aa]gent orchestration|mehreren Agents|multiple agents|multi-agent|full ceremony)'
target: trace
---
