# Inassembly
is a relatively unstable web framework that still needs lots of work.

## Concept

Build applications in the same fashion as React, a component based library, with less setup.
Create applications that download the components as the user navigates.

## Locations
```root/Inassembly.js``` is the file for the front-end library.

```root/compiler/index``` is the file for the back-end compiler/parser.

```root/docs/app.html``` is the entry point for docs.

## The compiler
Node is required for the compiler and will compile/parse the file into a json format so it could be sent to the front-end.

## The library
Renders the content in json form sent by the server into the dom. Needs a ton of work for stability.
