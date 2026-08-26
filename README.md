# vite-spring-env-config

Charge au démarrage d’une application Vite une configuration JSON injectée par
Spring dans un attribut HTML. La configuration peut ainsi varier entre les
environnements sans reconstruire le bundle front-end.

Le package est écrit en TypeScript, ne contient aucune dépendance d’exécution et
est distribué en ESM avec ses déclarations de types.

## Installation

```sh
npm install vite-spring-env-config
```

## Utilisation

### 1. Encoder la configuration côté Spring

Le JSON doit être converti en octets UTF-8 avant l’encodage Base64 standard :

```java
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

Map<String, Object> config = Map.of(
    "apiUrl", "https://api.example.com",
    "locale", "fr-FR"
);

String json = objectMapper.writeValueAsString(config);
String encoded = Base64.getEncoder().encodeToString(
    json.getBytes(StandardCharsets.UTF_8)
);

model.addAttribute("appConfig", encoded);
```

Avec Thymeleaf :

```html
<body id="app-body" th:attr="data-app-config=${appConfig}">
  <div id="app"></div>
</body>
```

### 2. Charger la configuration avant de démarrer l’application

```ts
import { getConfig, loadConfig } from 'vite-spring-env-config';

async function bootstrap(): Promise<void> {
  await loadConfig();

  const apiUrl = getConfig<string>('apiUrl');
  const locale = getConfig<string>('locale');

  // Démarrer ensuite Vue, React, Svelte, etc.
  console.log({ apiUrl, locale });
}

void bootstrap().catch((error: unknown) => {
  console.error('Impossible de démarrer l’application :', error);
});
```

`loadConfig()` doit être attendu. En cas d’échec, sa promesse est rejetée afin
que l’application puisse afficher une page d’erreur, envoyer une télémétrie ou
choisir explicitement une valeur de repli.

## Sélecteurs personnalisés

Les valeurs par défaut sont `app-body` et `data-app-config` :

```ts
await loadConfig({
  elementId: 'root',
  attributeName: 'data-runtime-config',
});
```

Un objet compatible avec la partie requise de `Document` peut également être
injecté via l’option `document`, ce qui facilite les tests et les iframes.

## Gestion des erreurs

```ts
import { AppConfigError, getConfig, loadConfig } from 'vite-spring-env-config';

try {
  await loadConfig();
  const apiUrl = getConfig<string>('apiUrl');
} catch (error: unknown) {
  if (error instanceof AppConfigError) {
    console.error(error.code, error.message);
  }
}
```

| Code                         | Signification                                       |
| ---------------------------- | --------------------------------------------------- |
| `DOM_UNAVAILABLE`            | `loadConfig` a été appelé sans DOM                  |
| `ELEMENT_NOT_FOUND`          | l’élément cible n’existe pas                        |
| `ATTRIBUTE_MISSING`          | l’attribut est absent ou vide                       |
| `BASE64_DECODER_UNAVAILABLE` | l’environnement ne fournit pas `atob`               |
| `INVALID_BASE64`             | la valeur n’est pas du Base64 standard valide       |
| `UTF8_DECODER_UNAVAILABLE`   | l’environnement ne fournit pas `TextDecoder`        |
| `INVALID_UTF8`               | les octets décodés ne forment pas du texte UTF-8    |
| `INVALID_JSON`               | le texte décodé n’est pas du JSON valide            |
| `INVALID_CONFIG`             | la racine JSON n’est pas un objet                   |
| `NOT_LOADED`                 | `getConfig` a été appelé avant un chargement réussi |
| `KEY_NOT_FOUND`              | la clé demandée n’existe pas                        |

Après un échec de rechargement, l’ancienne configuration n’est plus accessible.
La configuration chargée est figée récursivement pour prévenir les mutations
accidentelles. Le type de retour de `getConfig<T>()` applique également
`DeepReadonly<T>` : une tentative de modification est donc refusée par
TypeScript et à l’exécution.

## Typage

Le paramètre générique de `getConfig<T>()` est une assertion fournie par
l’appelant ; il ne valide pas la valeur à l’exécution :

```ts
interface FeatureFlags {
  newCheckout: boolean;
}

const flags = getConfig<FeatureFlags>('features');
```

Pour une frontière non fiable, validez les valeurs retournées avec le parseur de
votre choix (Zod, Valibot ou une fonction métier).

## Compatibilité

- Applications Vite et navigateurs modernes fournissant `atob` et `TextDecoder`.
- Import ESM uniquement. Ce choix évite que les variantes ESM et CommonJS du même
  package créent deux singletons distincts. Comme pour tout module, deux copies
  physiques du package conservent toutefois deux états indépendants.
- L’import est sûr pendant le SSR, car le DOM n’est consulté qu’à l’appel de
  `loadConfig()`. Cet appel doit être effectué côté client, une fois le DOM créé.

## Sécurité

Base64 est un encodage, pas un chiffrement. Toute valeur placée dans le DOM est
publique et modifiable par l’utilisateur. N’y placez jamais de secret et ne vous
servez jamais de cette configuration pour prendre une décision d’autorisation
côté serveur.

## Développement

```sh
npm ci
npm run check
npm pack --dry-run
```

Le script `check` contrôle le formatage, ESLint, TypeScript, les tests avec une
couverture à 100 %, le build ESM réellement produit, le manifeste publié et la
résolution des types depuis l’archive npm. Il installe également cette archive
dans un projet temporaire afin de vérifier les modes TypeScript `NodeNext` et
`Bundler`, puis d’exécuter le module installé.

## Licence

[MIT](./LICENSE)
