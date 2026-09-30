# Scripts

Reserved for small repository maintenance or development scripts agreed by both
developers. No database migration, seed or feature scripts are implemented yet.

Use the root npm scripts for installation, development, typechecking and builds.
Future scripts must document prerequisites, inputs, environment variables and
side effects here. Never embed secrets. Destructive database scripts must require
explicit intent and must not run automatically during installation or startup.
