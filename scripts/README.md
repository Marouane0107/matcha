# Scripts

This directory is reserved for small repository maintenance scripts. Current
database scripts live in `backend/db`; backend syntax checks live in
`backend/scripts`. See the [root README](../README.md) for working commands.

Use the root npm scripts for installation, development, typechecking and builds.
Scripts must document prerequisites, inputs, environment variables and
side effects here. Never embed secrets. Destructive database scripts must require
explicit intent and must not run automatically during installation or startup.
