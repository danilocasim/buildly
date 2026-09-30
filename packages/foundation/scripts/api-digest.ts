// The foundation's public API as the model sees it in the context builder
// (ARCHITECTURE.md §5). Declarations come from the source with bodies stripped, so the
// digest cannot drift from the code. scripts/build-api-digest.ts writes it to dist/.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

/** Modules and the exports the model may use from each. */
const API: { path: string; title: string; exports: string[] }[] = [
  {
    path: "src/components/index.ts",
    title: 'Components — `import { … } from "../components"`',
    exports: [
      "Screen",
      "ScreenProps",
      "Card",
      "CardProps",
      "ListRow",
      "ListRowProps",
      "Button",
      "ButtonProps",
      "TextField",
      "TextFieldProps",
      "EmptyState",
      "EmptyStateProps",
      "FAB",
      "FABProps",
      "DemoDataPill",
      "AboutScreen",
    ],
  },
  {
    path: "src/data/store.ts",
    title: 'Store — `import { … } from "./store"` in models.ts, `"../data/store"` in screens',
    exports: [
      "BaseRecord",
      "NewRecord",
      "Collection",
      "Repository",
      "defineCollection",
      "createRepository",
      "useRecords",
      "useRecord",
      "useHasDemoData",
    ],
  },
  {
    path: "src/theme/index.tsx",
    title: 'Theme — `import { useTheme } from "../theme"`',
    exports: ["useTheme", "Theme"],
  },
];

const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });

function sourceOf(root: string, path: string): ts.SourceFile {
  const text = readFileSync(join(root, path), "utf8");
  return ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/** Follows `export { X } from "./X"` re-exports to the declaring file. */
function declaringFile(root: string, path: string, name: string): string {
  const source = sourceOf(root, path);
  for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier || !statement.exportClause)
      continue;
    if (!ts.isNamedExports(statement.exportClause)) continue;
    if (statement.exportClause.elements.some((e) => e.name.text === name)) {
      const target = (statement.moduleSpecifier as ts.StringLiteral).text;
      const dir = path.slice(0, path.lastIndexOf("/"));
      for (const ext of [".tsx", ".ts"]) {
        const candidate = `${dir}/${target.replace(/^\.\//, "")}${ext}`;
        try {
          readFileSync(join(root, candidate));
          return candidate;
        } catch {
          // try the next extension
        }
      }
    }
  }
  return path;
}

/** The leading JSDoc of a node, if any. */
function jsDoc(node: ts.Node, source: ts.SourceFile): string {
  const ranges = ts.getLeadingCommentRanges(source.text, node.getFullStart()) ?? [];
  return ranges
    .map((r) => source.text.slice(r.pos, r.end))
    .filter((c) => c.startsWith("/**"))
    .join("\n");
}

function declaration(root: string, path: string, name: string): string {
  const file = declaringFile(root, path, name);
  const source = sourceOf(root, file);
  for (const statement of source.statements) {
    const exported =
      ts.canHaveModifiers(statement) &&
      ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    const doc = jsDoc(statement, source);
    const withDoc = (text: string) => (doc ? `${doc}\n${text}` : text);
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
      const signature = ts.factory.updateFunctionDeclaration(
        statement,
        statement.modifiers?.filter((m) => m.kind === ts.SyntaxKind.ExportKeyword),
        statement.asteriskToken,
        statement.name,
        statement.typeParameters,
        statement.parameters,
        statement.type,
        undefined,
      );
      return withDoc(
        printer.printNode(ts.EmitHint.Unspecified, signature, source).replace(/;?$/, ";"),
      );
    }
    if (
      (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
      statement.name.text === name
    ) {
      return withDoc(statement.getText(source));
    }
  }
  throw new Error(`${name} is not exported from ${path}`);
}

/** The digest for the foundation at `root` (packages/foundation). */
export function buildApiDigest(root: string): string {
  const sections = API.map(({ path, title, exports }) => {
    const body = exports.map((name) => declaration(root, path, name)).join("\n\n");
    return `## ${title}\n\n\`\`\`ts\n${body}\n\`\`\``;
  });
  const tokens = readFileSync(join(root, "src/theme/index.tsx"), "utf8");
  const tokenBlock = tokens.slice(
    tokens.indexOf("export const tokens"),
    tokens.indexOf("} as const;") + "} as const;".length,
  );
  const navigation = readFileSync(join(root, "src/navigation.tsx"), "utf8");
  const models = readFileSync(join(root, "src/data/models.ts"), "utf8");
  const seed = readFileSync(join(root, "src/data/seed.ts"), "utf8");

  return `# Foundation API digest

Generated by \`packages/foundation/scripts/build-api-digest.ts\`. Do not edit by hand.

Every app is the foundation plus project files. Foundation files are read-only; import them with relative paths.

${sections.join("\n\n")}

## Theme tokens

\`\`\`ts
${tokenBlock}
\`\`\`

Use \`const t = useTheme()\` and style with \`t.color.*\`, \`t.space.*\`, \`t.radius.*\`, and spread \`t.type.*\` into text styles. Never hard-code colors.

## Navigation pattern (project-owned \`src/navigation.tsx\`)

App.tsx renders \`<RootNavigator />\` inside the NavigationContainer. Keep exporting \`RootNavigator\`, \`RootStackParamList\`, and \`TabParamList\`. Tabs live in the \`Tabs\` stack screen; push detail and form screens on the root stack. Keep the About tab. Put \`<DemoDataPill />\` at the top of the first tab's screen.

Screens take no props. Read navigation and params with hooks:

\`\`\`ts
const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
const { params } = useRoute<RouteProp<RootStackParamList, "EntryDetail">>();
\`\`\`

The bare template:

\`\`\`tsx
${navigation.trimEnd()}
\`\`\`

## Data (project-owned \`src/data/models.ts\` and \`src/data/seed.ts\`)

\`models.ts\` exports \`schemaVersion\` and one repository per collection; \`seed.ts\` exports \`seed()\`, which creates demo records with \`isDemo: true\`. The bare template:

\`\`\`ts
${models.trimEnd()}
\`\`\`

\`\`\`ts
${seed.trimEnd()}
\`\`\`
`;
}
