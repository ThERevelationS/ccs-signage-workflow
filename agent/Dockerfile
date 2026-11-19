FROM node:22-alpine
# Requires Node >=22.13 for unflagged node:sqlite (22-alpine latest satisfies).
# FTS5 is probed at runtime — agent degrades to LIKE search if unavailable.
#
# OPTIONAL: office→PDF inline previews (docx/xlsx/pptx render in the app
# viewer). The agent probes for soffice at startup and dark-lanes without it.
# Uncomment to enable (~500MB image growth):
#   RUN apk add --no-cache libreoffice
WORKDIR /app
COPY filebridge-agent.mjs /app/filebridge-agent.mjs
# State: /state (sqlite index, entity_ids.db, spool/, agent.log)
# Roots: mount each share read-only at /roots/<name> (or rw for the write root
#        on the primary — see docs/unraid-filebridge-setup.md)
VOLUME ["/state"]
ENV FB_STATE_DIR=/state
CMD ["node", "/app/filebridge-agent.mjs"]
