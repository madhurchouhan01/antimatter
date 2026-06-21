#!/bin/bash
# welcome.sh - configured and printed when an interactive terminal session starts.

# Set prompt and aliases
export PS1="\[\e[1;35m\]⚡ Antimatter \[\e[1;36m\]\w \[\e[1;30m\]❯ \[\e[0m\]"
alias ls="ls --color=auto"

if [[ $- == *i* ]]; then
    clear
    echo -e '\e[1;35m    ___          __  _ __  ___      __  __           \e[0m'
    echo -e '\e[1;34m   /   |  ____  / /_(_)  |/  /___ _/ /_/ /____  _____\e[0m'
    echo -e '\e[1;36m  / /| | / __ \/ __/ / /|_/ / __ \`/ __/ __/ _ \/ ___/\e[0m'
    echo -e '\e[1;34m / ___ |/ / / / /_/ / /  / / /_/ / /_/ /_/  __/ /    \e[0m'
    echo -e '\e[1;35m/_/  |_/_/ /_/\__/_/_/  /_/\__,_/\__/\__/\___/_/     \e[0m'
    echo ""
    echo -e '\e[90m  ── Isolated Developer Workspace Ready ──\e[0m'
    echo -e '\e[32m  ✔ Connected to environment sandbox securely\e[0m'
    echo -e '\e[36m  ⚡ Type commands below to execute them\e[0m'
    echo ""
fi
