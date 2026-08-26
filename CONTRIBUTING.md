# Contribuer

Les changements doivent rester compatibles avec l’API publique documentée et
être accompagnés de tests.

```sh
npm ci
npm run check
```

Avant une publication, vérifiez également le contenu exact de l’archive :

```sh
npm pack --dry-run
```

Utilisez les règles de versionnage sémantique : correctif pour un bug compatible,
version mineure pour une fonctionnalité compatible et version majeure pour une
rupture d’API.
