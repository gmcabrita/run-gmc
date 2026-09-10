import { describe, it } from "node:test";
import { RuleTester } from "oxlint/plugins-dev";

import { noObjectParametersRule } from "../rules/no-object-parameters.ts";
import { noUnsafeDictionaryTypeRule } from "../rules/no-unsafe-dictionary-type.ts";

// Run with: node tools/oxlint/anti-slop/shared/type-alias-resolution.rule-test.ts
// The suffix keeps Node RuleTester cases out of the Workers Vitest suite.
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run("no-object-parameters class name scope", noObjectParametersRule, {
	valid: [
		{
			name: "a named class expression shadows an outer object alias inside its body",
			filename: "class-expression.ts",
			code: `
				type Payload = object;
				const Container = class Payload {
					accept(value: Payload) {}
				};
			`,
		},
		{
			name: "a class declaration shadows an outer alias throughout its enclosing block",
			filename: "class-declaration.ts",
			code: `
				type Payload = object;
				function createContainer() {
					function before(value: Payload) {}
					class Payload { accept(value: Payload) {} }
					function after(value: Payload) {}
				}
			`,
		},
	],
	invalid: [
		{
			name: "a named class expression leaves the outer alias visible before and after it",
			filename: "class-expression.ts",
			code: `
				type Payload = object;
				function before(value: Payload) {}
				const Container = class Payload { accept(value: Payload) {} };
				function after(value: Payload) {}
			`,
			errors: [
				{ messageId: "objectParameter", line: 3 },
				{ messageId: "objectParameter", line: 5 },
			],
		},
		{
			name: "a named class expression leaves an alias visible in the same function block",
			filename: "class-expression.ts",
			code: `
				function createContainer() {
					type Payload = object;
					function before(value: Payload) {}
					const Container = class Payload { accept(value: Payload) {} };
					function after(value: Payload) {}
				}
			`,
			errors: [
				{ messageId: "objectParameter", line: 4 },
				{ messageId: "objectParameter", line: 6 },
			],
		},
		{
			name: "a class declaration shadows an alias only within its enclosing block",
			filename: "class-declaration.ts",
			code: `
				type Payload = object;
				function outside(value: Payload) {}
				function createContainer() {
					function before(value: Payload) {}
					class Payload { accept(value: Payload) {} }
					function after(value: Payload) {}
				}
			`,
			errors: [{ messageId: "objectParameter", line: 3 }],
		},
	],
});

ruleTester.run("no-unsafe-dictionary-type class name scope", noUnsafeDictionaryTypeRule, {
	valid: [
		{
			name: "a named class expression shadows an unknown value alias inside its body",
			filename: "class-expression.ts",
			code: `
				type Value = unknown;
				const Container = class Value {
					accept(values: Record<string, Value>) {}
				};
			`,
		},
		{
			name: "a named class expression shadows the built-in Record inside its body",
			filename: "class-expression.ts",
			code: `
				const Container = class Record<K, V> {
					accept(values: Record<string, unknown>) {}
				};
			`,
		},
		{
			name: "a class declaration shadows an outer value alias throughout its enclosing block",
			filename: "class-declaration.ts",
			code: `
				type Value = unknown;
				function createContainer() {
					function before(values: Record<string, Value>) {}
					class Value { accept(values: Record<string, Value>) {} }
					function after(values: Record<string, Value>) {}
				}
			`,
		},
	],
	invalid: [
		{
			name: "a named class expression leaves the outer value alias visible before and after it",
			filename: "class-expression.ts",
			code: `
				type Value = unknown;
				function before(values: Record<string, Value>) {}
				const Container = class Value { accept(values: Record<string, Value>) {} };
				function after(values: Record<string, Value>) {}
			`,
			errors: [
				{ messageId: "unsafeDictionary", line: 3 },
				{ messageId: "unsafeDictionary", line: 5 },
			],
		},
		{
			name: "a named class expression leaves the built-in Record visible before and after it",
			filename: "class-expression.ts",
			code: `
				function before(values: Record<string, unknown>) {}
				const Container = class Record<K, V> { accept(values: Record<string, unknown>) {} };
				function after(values: Record<string, unknown>) {}
			`,
			errors: [
				{ messageId: "unsafeDictionary", line: 2 },
				{ messageId: "unsafeDictionary", line: 4 },
			],
		},
		{
			name: "a class declaration shadows the built-in Record only within its enclosing block",
			filename: "class-declaration.ts",
			code: `
				function outside(values: Record<string, unknown>) {}
				function createContainer() {
					function before(values: Record<string, unknown>) {}
					class Record<K, V> { accept(values: Record<string, unknown>) {} }
					function after(values: Record<string, unknown>) {}
				}
			`,
			errors: [{ messageId: "unsafeDictionary", line: 2 }],
		},
	],
});
