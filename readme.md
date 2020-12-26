# Cosmonaut

Cosmonaut is an unofficial ORM (with deemphasis on the "R") for Cosmos DB. I grew tired of copying a utility library to use between projects.

Although Cosmos DB speaks "SQL", it acts more like a document DB, so something like [Sequelize](https://sequelize.org/) doesn't work well. Cosmosnaut aims to provide an easy to use, efficient, and typesafe (for TypeScript consumers) object model over the base Azure client library. It should also be pleasant and possible to use for non-TypeScript consumers.

This library does not support explicitly unpartitioned collections; Cosmos DB is increasingly pushing away from them. You can get the same effect by setting .
