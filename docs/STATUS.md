# Status board

Updated by the lead. Times are Helsinki time.

## Now

**Phase 1: foundation** (started Fri 13 Nov, 21:05)

| Item | Owner | State |
|---|---|---|
| Repo, docs, research notes, rules | lead | done |
| App scaffold (Next.js, tooling, tests, Dockerfile, CI) | Sonnet agent | running |
| Specs: interview, Signal Card, responsible AI | Opus agent | running |
| Specs: Need Card, matching, picks, organiser console, synthetic world | Opus agent | running |
| Contracts (`src/contracts`) | lead | in progress |
| VPS bootstrap, Caddy, push-to-deploy | Opus agent | **blocked: SSH key login to the VPS does not work yet** |
| DB schema and first migration | lead | after scaffold |
| LLM gateway and probe | Sonnet agent | after scaffold |
| Platform primitives (session, consent, audit, redaction, queue) | Sonnet agent | after scaffold |
| ESCO import and Työmarkkinatori ingester | Sonnet agent | after scaffold |
| Voice and turn spike | Sonnet agent | after gateway |
| Fixtures and golden-path test | lead | after schema |

## Waiting on the owner

1. First login on the VPS and `ssh-copy-id -i ~/.ssh/id_ed25519.pub root@2.29.206.251`.
2. A Verda key and/or an NVIDIA key for the models.
3. Optional: an ElevenLabs key for voice.

## Gates

- [ ] Gate 1: live URL over HTTPS, deploy works, streamed model turn, voice round trip, 1,000+ Espoo postings and ESCO in the database
- [ ] Gate 2: full path works end to end on unstyled pages; evaluation report from simulated interviews
- [ ] Gate 3: styled product, golden-path test green on the live site, backup video, demo freeze
