#!/usr/bin/env bash
# #1240, the hook itself: the same project and thread stub as
# implement-click-starts-build, but the starting brief literally orders a
# decision card before any implementation. The session is expected to reach
# for the card; pre.concept.implement-order must hold it back (graders.js says
# why the build is not graded here).
set -e
bash "$(dirname "$0")/../implement-click-starts-build/scaffold.sh"
