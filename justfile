# BBModel Unpack monorepo recipes
# Requires: Node 20+, npm, just (https://github.com/casey/just) — not an npm dependency.

set windows-shell := ["powershell.exe", "-NoProfile", "/c"]

# default: list available recipes
default:
    @just --list

# install all workspaces
install:
    npm install

# build all packages, in dependency order (core -> vsc + mcp)
build:
    npm run build

# alias for build (kept for muscle memory from the old tsc workflow)
compile: build

# compile, then run @bbmodel-tools/core unit tests
test:
    npm test

# eslint across all packages
lint:
    npm run lint

# regenerate the .bbmodel test fixtures in packages/core/fixtures
fixtures:
    npm run fixtures

# regenerate packages/vsc/media/icon.png
icon:
    npm run icon -w packages/vsc

# build @bbmodel-tools/core then bundle + package the VS Code extension (.vsix)
package-vsc:
    npm run package:vsc

# show what an npm publish of each package would ship (no upload)
check-publish:
    npm pack --dry-run -w packages/core
    npm pack --dry-run -w packages/mcp
    npm pack --dry-run -w packages/render

# publish @bbmodel-tools/core and @bbmodel-tools/mcp to npm (requires `npm login`)
publish:
    npm publish -w packages/core
    npm publish -w packages/mcp
    npm publish -w packages/render

# start the MCP server in the foreground (stdio)
run-mcp:
    node packages/mcp/dist/index.js
