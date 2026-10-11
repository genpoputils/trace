import ts from 'typescript';
import {
  TraceEntity,
  TraceRelationship,
  EntityKind,
  SourceLocation,
  AnalysisWarning,
  FileRecord,
} from '../types/trace';

export interface FileAnalysisOutput {
  fileEntity: TraceEntity;
  entities: TraceEntity[];
  relationships: TraceRelationship[];
  imports: FileImport[];
  exports: FileExport[];
  warnings: AnalysisWarning[];
  unresolvedCalls: { name: string; location: SourceLocation; reason: string }[];
}

export interface FileImport {
  sourceModule: string; // e.g. './db' or 'express'
  specifiers: { importedName: string; localName: string; isDefault: boolean; isNamespace: boolean }[];
  location: SourceLocation;
}

export interface FileExport {
  exportedName: string;
  localName: string;
  isDefault: boolean;
  location: SourceLocation;
}

export interface LocalSymbolRef {
  name: string;
  kind: EntityKind;
  entityId: string;
  isExported: boolean;
}

/**
 * TypeScript and JavaScript AST Analysis Adapter using TypeScript Compiler API
 */
export class TypeScriptAdapter {
  supports(filePath: string): boolean {
    const ext = filePath.toLowerCase();
    return (
      ext.endsWith('.ts') ||
      ext.endsWith('.tsx') ||
      ext.endsWith('.js') ||
      ext.endsWith('.jsx') ||
      ext.endsWith('.mjs') ||
      ext.endsWith('.cjs')
    );
  }

  analyzeFile(fileRecord: FileRecord): FileAnalysisOutput {
    const { path: filePath, content } = fileRecord;
    const scriptKind = this.getScriptKind(filePath);

    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true, // setParentNodes = true
      scriptKind
    );

    const entities: TraceEntity[] = [];
    const relationships: TraceRelationship[] = [];
    const imports: FileImport[] = [];
    const exports: FileExport[] = [];
    const warnings: AnalysisWarning[] = [];
    const unresolvedCalls: { name: string; location: SourceLocation; reason: string }[] = [];
    const localSymbols = new Map<string, LocalSymbolRef>();

    const lines = content.split('\n');

    // 1. File Entity
    const fileLoc: SourceLocation = {
      filePath,
      startLine: 1,
      endLine: lines.length || 1,
      startColumn: 1,
      endColumn: (lines[lines.length - 1] || '').length + 1,
    };

    const fileEntity: TraceEntity = {
      id: `${filePath}#file#${filePath}#1`,
      name: filePath.split('/').pop() || filePath,
      kind: 'file',
      filePath,
      location: fileLoc,
      isExported: true,
      snippet: lines.slice(0, 10).join('\n'),
      metadata: {
        totalLines: lines.length,
        sizeBytes: fileRecord.size,
      },
    };

    // Helper to get SourceLocation from ts.Node
    const getLocation = (node: ts.Node): SourceLocation => {
      const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
      return {
        filePath,
        startLine: start.line + 1,
        endLine: end.line + 1,
        startColumn: start.character + 1,
        endColumn: end.character + 1,
      };
    };

    const getSnippet = (node: ts.Node, maxLines = 15): string => {
      const loc = getLocation(node);
      const excerpt = lines.slice(loc.startLine - 1, loc.endLine).slice(0, maxLines).join('\n');
      return excerpt.trim();
    };

    // Helper to extract JSDoc
    const getJSDoc = (node: ts.Node): string | undefined => {
      // @ts-expect-error jsDoc is on node
      const jsDoc = node.jsDoc as { comment?: string | unknown[] }[] | undefined;
      if (jsDoc && jsDoc.length > 0) {
        const comment = jsDoc[0].comment;
        if (typeof comment === 'string') return comment;
        if (Array.isArray(comment)) return comment.map((c: any) => (c?.text ? c.text : '')).join('');
      }
      return undefined;
    };

    // Helper to extract parameters
    const extractParameters = (params: ts.NodeArray<ts.ParameterDeclaration>) => {
      return params.map((p) => {
        const name = p.name.getText(sourceFile);
        const type = p.type ? p.type.getText(sourceFile) : undefined;
        const defaultValue = p.initializer ? p.initializer.getText(sourceFile) : undefined;
        return { name, type, defaultValue };
      });
    };

    // Detect Express / Router / Next.js routes
    const detectRoute = (node: ts.Node): TraceEntity | null => {
      if (ts.isCallExpression(node)) {
        const expr = node.expression;
        if (ts.isPropertyAccessExpression(expr)) {
          const methodName = expr.name.text.toLowerCase();
          const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'use', 'all'];
          if (httpMethods.includes(methodName) && node.arguments.length >= 2) {
            const firstArg = node.arguments[0];
            let routePath = '';
            if (ts.isStringLiteral(firstArg) || ts.isNoSubstitutionTemplateLiteral(firstArg)) {
              routePath = firstArg.text;
            } else {
              routePath = firstArg.getText(sourceFile);
            }

            const loc = getLocation(node);
            const routeEntity: TraceEntity = {
              id: `${filePath}#route#${methodName.toUpperCase()} ${routePath}#${loc.startLine}`,
              name: `${methodName.toUpperCase()} ${routePath}`,
              kind: 'route',
              filePath,
              location: loc,
              snippet: getSnippet(node, 6),
              isExported: true,
              framework: 'express',
              metadata: {
                httpMethod: methodName.toUpperCase() as any,
                routePath,
              },
            };
            return routeEntity;
          }
        }
      }
      return null;
    };

    // Detect Database operations (Prisma, Mongoose, SQL)
    const detectDbOperation = (node: ts.CallExpression): TraceEntity | null => {
      const expr = node.expression;
      if (ts.isPropertyAccessExpression(expr)) {
        const opName = expr.name.text;
        const targetExpr = expr.expression;

        // Prisma pattern: prisma.<model>.<op>(...)
        if (ts.isPropertyAccessExpression(targetExpr)) {
          const clientName = targetExpr.expression.getText(sourceFile).toLowerCase();
          if (clientName === 'prisma' || clientName.endsWith('prisma')) {
            const modelName = targetExpr.name.text;
            const loc = getLocation(node);
            return {
              id: `${filePath}#db_query#prisma.${modelName}.${opName}#${loc.startLine}`,
              name: `prisma.${modelName}.${opName}`,
              kind: 'db_query',
              filePath,
              location: loc,
              snippet: getSnippet(node, 4),
              isExported: false,
              framework: 'prisma',
              metadata: {
                dbModel: modelName,
                dbOperation: opName,
              },
            };
          }
        }

        // Generic db query: db.query(...) or pool.query(...)
        const objText = targetExpr.getText(sourceFile).toLowerCase();
        if ((objText === 'db' || objText === 'pool' || objText === 'client') && opName === 'query') {
          const loc = getLocation(node);
          return {
            id: `${filePath}#db_query#${objText}.query#${loc.startLine}`,
            name: `${objText}.query`,
            kind: 'db_query',
            filePath,
            location: loc,
            snippet: getSnippet(node, 4),
            isExported: false,
            metadata: {
              dbOperation: 'query',
            },
          };
        }
      }
      return null;
    };

    // Pass 1: Collect Imports, Exports, and Declarations
    const visitDeclarations = (node: ts.Node) => {
      // Import declarations
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier;
        if (ts.isStringLiteral(moduleSpecifier)) {
          const sourceModule = moduleSpecifier.text;
          const loc = getLocation(node);
          const specifiers: FileImport['specifiers'] = [];

          const importClause = node.importClause;
          if (importClause) {
            if (importClause.name) {
              // Default import
              specifiers.push({
                importedName: 'default',
                localName: importClause.name.text,
                isDefault: true,
                isNamespace: false,
              });
            }
            if (importClause.namedBindings) {
              if (ts.isNamespaceImport(importClause.namedBindings)) {
                // Namespace import * as foo
                specifiers.push({
                  importedName: '*',
                  localName: importClause.namedBindings.name.text,
                  isDefault: false,
                  isNamespace: true,
                });
              } else if (ts.isNamedImports(importClause.namedBindings)) {
                for (const element of importClause.namedBindings.elements) {
                  const importedName = element.propertyName ? element.propertyName.text : element.name.text;
                  const localName = element.name.text;
                  specifiers.push({
                    importedName,
                    localName,
                    isDefault: false,
                    isNamespace: false,
                  });
                }
              }
            }
          }

          imports.push({ sourceModule, specifiers, location: loc });
        }
      }

      // Export declarations
      if (ts.isExportDeclaration(node)) {
        const loc = getLocation(node);
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const el of node.exportClause.elements) {
            const localName = el.propertyName ? el.propertyName.text : el.name.text;
            const exportedName = el.name.text;
            exports.push({ exportedName, localName, isDefault: false, location: loc });
          }
        }
      }

      // Function Declarations
      if (ts.isFunctionDeclaration(node) && node.name) {
        const name = node.name.text;
        const loc = getLocation(node);
        const isExported = hasExportModifier(node);
        const isAsync = !!(node.modifiers && node.modifiers.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword));
        const params = extractParameters(node.parameters);
        const returnType = node.type ? node.type.getText(sourceFile) : undefined;
        const docstring = getJSDoc(node);

        // Next.js App Router route check: export async function GET / POST etc. in route.ts
        const isNextRoute =
          isExported &&
          (filePath.endsWith('/route.ts') || filePath.endsWith('/route.js') || filePath.endsWith('\\route.ts') || filePath.endsWith('\\route.js')) &&
          ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(name);

        const isHook = name.startsWith('use') && name.length > 3 && name[3] === name[3].toUpperCase();
        const isComponent = !isNextRoute && !isHook && name[0] === name[0].toUpperCase() && (filePath.endsWith('.tsx') || filePath.endsWith('.jsx'));

        let kind: EntityKind = 'function';
        let framework: TraceEntity['framework'] = undefined;
        if (isNextRoute) {
          kind = 'route';
          framework = 'nextjs';
        } else if (isHook) {
          kind = 'hook';
          framework = 'react';
        } else if (isComponent) {
          kind = 'component';
          framework = 'react';
        }

        const entityId = `${filePath}#${kind}#${name}#${loc.startLine}`;

        const entity: TraceEntity = {
          id: entityId,
          name: isNextRoute ? `${name} ${filePath}` : name,
          kind,
          filePath,
          location: loc,
          snippet: getSnippet(node, 20),
          docstring,
          parameters: params,
          returnType,
          isExported,
          isAsync,
          framework,
          metadata: isNextRoute
            ? { httpMethod: name as any, routePath: filePath }
            : undefined,
        };

        entities.push(entity);
        localSymbols.set(name, { name, kind, entityId, isExported });

        // Relationship: file defines function/component/hook
        relationships.push({
          id: `${fileEntity.id}->defines->${entity.id}`,
          sourceId: fileEntity.id,
          targetId: entity.id,
          kind: 'defines',
          confidence: 'statically_resolved',
          location: loc,
        });

        if (isExported) {
          exports.push({ exportedName: name, localName: name, isDefault: hasDefaultModifier(node), location: loc });
        }
      }

      // Variable Declarations (Arrow functions / function expressions / Route assignments)
      if (ts.isVariableStatement(node)) {
        const isExported = hasExportModifier(node);
        const loc = getLocation(node);

        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.initializer) {
            const varName = decl.name.text;
            const init = decl.initializer;

            if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
              const fnLoc = getLocation(decl);
              const isAsync = !!(init.modifiers && init.modifiers.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword));
              const params = extractParameters(init.parameters);
              const returnType = init.type ? init.type.getText(sourceFile) : undefined;
              const docstring = getJSDoc(node);

              const isHook = varName.startsWith('use') && varName.length > 3 && varName[3] === varName[3].toUpperCase();
              const isComponent = !isHook && varName[0] === varName[0].toUpperCase() && (filePath.endsWith('.tsx') || filePath.endsWith('.jsx'));

              let kind: EntityKind = 'function';
              let framework: TraceEntity['framework'] = undefined;
              if (isHook) {
                kind = 'hook';
                framework = 'react';
              } else if (isComponent) {
                kind = 'component';
                framework = 'react';
              }

              const entityId = `${filePath}#${kind}#${varName}#${fnLoc.startLine}`;
              const entity: TraceEntity = {
                id: entityId,
                name: varName,
                kind,
                filePath,
                location: fnLoc,
                snippet: getSnippet(node, 20),
                docstring,
                parameters: params,
                returnType,
                isExported,
                isAsync,
                framework,
              };

              entities.push(entity);
              localSymbols.set(varName, { name: varName, kind: 'function', entityId, isExported });

              relationships.push({
                id: `${fileEntity.id}->defines->${entity.id}`,
                sourceId: fileEntity.id,
                targetId: entity.id,
                kind: 'defines',
                confidence: 'statically_resolved',
                location: fnLoc,
              });

              if (isExported) {
                exports.push({ exportedName: varName, localName: varName, isDefault: hasDefaultModifier(node), location: fnLoc });
              }
            } else {
              // General variable/service instance/client
              const entityId = `${filePath}#variable#${varName}#${loc.startLine}`;
              const entity: TraceEntity = {
                id: entityId,
                name: varName,
                kind: 'variable',
                filePath,
                location: loc,
                snippet: getSnippet(decl, 5),
                isExported,
              };
              entities.push(entity);
              localSymbols.set(varName, { name: varName, kind: 'variable', entityId, isExported });
            }
          }
        }
      }

      // Class Declarations
      if (ts.isClassDeclaration(node) && node.name) {
        const className = node.name.text;
        const loc = getLocation(node);
        const isExported = hasExportModifier(node);
        const docstring = getJSDoc(node);

        const entityId = `${filePath}#class#${className}#${loc.startLine}`;
        const classEntity: TraceEntity = {
          id: entityId,
          name: className,
          kind: 'class',
          filePath,
          location: loc,
          snippet: getSnippet(node, 15),
          docstring,
          isExported,
        };

        entities.push(classEntity);
        localSymbols.set(className, { name: className, kind: 'class', entityId, isExported });

        relationships.push({
          id: `${fileEntity.id}->defines->${classEntity.id}`,
          sourceId: fileEntity.id,
          targetId: classEntity.id,
          kind: 'defines',
          confidence: 'statically_resolved',
          location: loc,
        });

        // Inheritance: extends
        if (node.heritageClauses) {
          for (const clause of node.heritageClauses) {
            for (const type of clause.types) {
              const baseName = type.expression.getText(sourceFile);
              if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
                classEntity.metadata = { ...classEntity.metadata, baseClass: baseName };
              }
            }
          }
        }

        // Methods inside class
        for (const member of node.members) {
          if (ts.isMethodDeclaration(member) && member.name) {
            const methodName = member.name.getText(sourceFile);
            const mLoc = getLocation(member);
            const isAsync = !!(member.modifiers && member.modifiers.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword));
            const params = extractParameters(member.parameters);
            const mEntityId = `${filePath}#method#${className}.${methodName}#${mLoc.startLine}`;

            const methodEntity: TraceEntity = {
              id: mEntityId,
              name: `${className}.${methodName}`,
              kind: 'method',
              filePath,
              location: mLoc,
              snippet: getSnippet(member, 15),
              docstring: getJSDoc(member),
              parameters: params,
              isExported,
              isAsync,
              metadata: { className },
            };

            entities.push(methodEntity);
            localSymbols.set(`${className}.${methodName}`, {
              name: `${className}.${methodName}`,
              kind: 'method',
              entityId: mEntityId,
              isExported,
            });

            relationships.push({
              id: `${classEntity.id}->defines->${methodEntity.id}`,
              sourceId: classEntity.id,
              targetId: methodEntity.id,
              kind: 'defines',
              confidence: 'statically_resolved',
              location: mLoc,
            });
          }
        }
      }

      // Interfaces and Types
      if (ts.isInterfaceDeclaration(node)) {
        const name = node.name.text;
        const loc = getLocation(node);
        const entityId = `${filePath}#interface#${name}#${loc.startLine}`;
        entities.push({
          id: entityId,
          name,
          kind: 'interface',
          filePath,
          location: loc,
          snippet: getSnippet(node, 10),
          isExported: hasExportModifier(node),
        });
      }

      if (ts.isTypeAliasDeclaration(node)) {
        const name = node.name.text;
        const loc = getLocation(node);
        const entityId = `${filePath}#type_alias#${name}#${loc.startLine}`;
        entities.push({
          id: entityId,
          name,
          kind: 'type_alias',
          filePath,
          location: loc,
          snippet: getSnippet(node, 10),
          isExported: hasExportModifier(node),
        });
      }

      // Detect Express routes
      const route = detectRoute(node);
      if (route) {
        entities.push(route);
        relationships.push({
          id: `${fileEntity.id}->defines->${route.id}`,
          sourceId: fileEntity.id,
          targetId: route.id,
          kind: 'defines',
          confidence: 'statically_resolved',
          location: route.location,
        });
      }

      ts.forEachChild(node, visitDeclarations);
    };

    visitDeclarations(sourceFile);

    // Pass 2: Detect Calls, DB operations, Environment variables, and Data Flow within scopes
    let currentScopeEntity: TraceEntity = fileEntity;

    const findEnclosingEntity = (node: ts.Node): TraceEntity => {
      let curr: ts.Node | undefined = node.parent;
      while (curr) {
        if (ts.isFunctionDeclaration(curr) && curr.name) {
          const found = entities.find((e) => e.location.startLine === getLocation(curr!).startLine);
          if (found) return found;
        }
        if (ts.isMethodDeclaration(curr)) {
          const found = entities.find((e) => e.location.startLine === getLocation(curr!).startLine);
          if (found) return found;
        }
        if (ts.isArrowFunction(curr) || ts.isFunctionExpression(curr)) {
          const parent = curr.parent;
          if (parent && ts.isVariableDeclaration(parent)) {
            const found = entities.find((e) => e.location.startLine === getLocation(parent).startLine);
            if (found) return found;
          }
        }
        if (ts.isCallExpression(curr)) {
          // If inside a route handler e.g. app.get('/...', (req, res) => { ... })
          const route = entities.find((e) => e.kind === 'route' && e.location.startLine === getLocation(curr!).startLine);
          if (route) return route;
        }
        curr = curr.parent;
      }
      return fileEntity;
    };

    const visitCallsAndReferences = (node: ts.Node) => {
      // Detect DB queries
      if (ts.isCallExpression(node)) {
        const dbQuery = detectDbOperation(node);
        if (dbQuery) {
          entities.push(dbQuery);
          const caller = findEnclosingEntity(node);
          relationships.push({
            id: `${caller.id}->calls->${dbQuery.id}#${dbQuery.location.startLine}`,
            sourceId: caller.id,
            targetId: dbQuery.id,
            kind: 'calls',
            confidence: 'statically_resolved',
            location: dbQuery.location,
            evidenceSnippet: getSnippet(node, 3),
            notes: `Database operation: ${dbQuery.name}`,
          });
        }
      }

      // Detect function calls
      if (ts.isCallExpression(node)) {
        const caller = findEnclosingEntity(node);
        const expr = node.expression;
        const callLoc = getLocation(node);
        const callSnippet = getSnippet(node, 3);

        // Case A: Direct call to an identifier e.g. hashPassword(pass), validate(data)
        if (ts.isIdentifier(expr)) {
          const calleeName = expr.text;
          const local = localSymbols.get(calleeName);

          if (local) {
            relationships.push({
              id: `${caller.id}->calls->${local.entityId}#${callLoc.startLine}`,
              sourceId: caller.id,
              targetId: local.entityId,
              kind: 'calls',
              confidence: 'statically_resolved',
              location: callLoc,
              evidenceSnippet: callSnippet,
              notes: `Direct local call to ${calleeName}`,
            });
          } else {
            // Check if imported from another module
            const imp = imports.find((i) =>
              i.specifiers.some((s) => s.localName === calleeName)
            );

            if (imp) {
              const spec = imp.specifiers.find((s) => s.localName === calleeName);
              // Target will be resolved across modules in cross-module linker
              relationships.push({
                id: `${caller.id}->calls->import:${imp.sourceModule}:${spec?.importedName}#${callLoc.startLine}`,
                sourceId: caller.id,
                targetId: `__import__:${imp.sourceModule}:${spec?.importedName || calleeName}`,
                kind: 'calls',
                confidence: 'statically_resolved',
                location: callLoc,
                evidenceSnippet: callSnippet,
                notes: `Call to imported function ${calleeName} from ${imp.sourceModule}`,
              });
            } else if (!['console', 'setTimeout', 'setInterval', 'require', 'parseInt', 'parseFloat', 'String', 'Number', 'Boolean', 'Promise', 'Array', 'Object', 'Error'].includes(calleeName)) {
              // Could be an unresolved dynamic call or global
              unresolvedCalls.push({
                name: calleeName,
                location: callLoc,
                reason: `Function '${calleeName}' is neither locally declared nor imported statically in this module.`,
              });
            }
          }
        }
        // Case B: Method call e.g. orderService.createOrder(payload)
        else if (ts.isPropertyAccessExpression(expr)) {
          const methodName = expr.name.text;
          const objExpr = expr.expression;
          const objName = objExpr.getText(sourceFile);

          // Check if object is a known imported service or local class instance
          const imp = imports.find((i) =>
            i.specifiers.some((s) => s.localName === objName)
          );

          if (imp) {
            relationships.push({
              id: `${caller.id}->calls->import:${imp.sourceModule}:${objName}.${methodName}#${callLoc.startLine}`,
              sourceId: caller.id,
              targetId: `__import__:${imp.sourceModule}:${objName}.${methodName}`,
              kind: 'calls',
              confidence: 'statically_resolved',
              location: callLoc,
              evidenceSnippet: callSnippet,
              notes: `Method call on imported object ${objName}.${methodName}`,
            });
          } else {
            // Check local symbol
            const localClassMethod = localSymbols.get(`${objName}.${methodName}`);
            if (localClassMethod) {
              relationships.push({
                id: `${caller.id}->calls->${localClassMethod.entityId}#${callLoc.startLine}`,
                sourceId: caller.id,
                targetId: localClassMethod.entityId,
                kind: 'calls',
                confidence: 'statically_resolved',
                location: callLoc,
                evidenceSnippet: callSnippet,
                notes: `Local method call ${objName}.${methodName}`,
              });
            } else if (objName === 'this') {
              // Call to this.someMethod
              const enclosingClass = entities.find((e) => e.kind === 'class' && e.location.startLine <= callLoc.startLine && e.location.endLine >= callLoc.endLine);
              if (enclosingClass) {
                const targetMethod = entities.find((e) => e.kind === 'method' && e.name === `${enclosingClass.name}.${methodName}`);
                if (targetMethod) {
                  relationships.push({
                    id: `${caller.id}->calls->${targetMethod.id}#${callLoc.startLine}`,
                    sourceId: caller.id,
                    targetId: targetMethod.id,
                    kind: 'calls',
                    confidence: 'statically_resolved',
                    location: callLoc,
                    evidenceSnippet: callSnippet,
                    notes: `Call to this.${methodName}`,
                  });
                }
              }
            } else if (!['log', 'error', 'warn', 'info', 'map', 'filter', 'forEach', 'reduce', 'push', 'slice', 'join', 'split', 'trim', 'then', 'catch', 'json', 'status', 'send'].includes(methodName)) {
              // Inferred method call
              relationships.push({
                id: `${caller.id}->calls->inferred:${objName}.${methodName}#${callLoc.startLine}`,
                sourceId: caller.id,
                targetId: `__inferred__:${objName}.${methodName}`,
                kind: 'calls',
                confidence: 'inferred',
                location: callLoc,
                evidenceSnippet: callSnippet,
                notes: `Inferred method call ${objName}.${methodName}`,
              });
            }
          }
        }
        // Case C: Dynamic or Computed Call e.g. handlers[action]() or (cond ? fnA : fnB)()
        else if (ts.isElementAccessExpression(expr)) {
          unresolvedCalls.push({
            name: expr.getText(sourceFile),
            location: callLoc,
            reason: `Dynamic computed property call: ${expr.getText(sourceFile)}. Statically indeterminate dispatch.`,
          });
          warnings.push({
            filePath,
            line: callLoc.startLine,
            message: `Dynamic dispatch cannot be statically resolved: ${expr.getText(sourceFile)}`,
            severity: 'info',
            construct: 'computed_call',
          });
        }
      }

      // Detect environment variables: process.env.XYZ
      if (ts.isPropertyAccessExpression(node)) {
        if (ts.isPropertyAccessExpression(node.expression)) {
          const obj = node.expression.expression.getText(sourceFile);
          const prop = node.expression.name.text;
          if (obj === 'process' && prop === 'env') {
            const envVarName = node.name.text;
            const caller = findEnclosingEntity(node);
            const envLoc = getLocation(node);
            const envEntityId = `${filePath}#variable#process.env.${envVarName}#${envLoc.startLine}`;

            const envEntity: TraceEntity = {
              id: envEntityId,
              name: `process.env.${envVarName}`,
              kind: 'variable',
              filePath,
              location: envLoc,
              isExported: false,
              metadata: { envVarName },
            };
            entities.push(envEntity);

            relationships.push({
              id: `${caller.id}->reads_from->${envEntity.id}`,
              sourceId: caller.id,
              targetId: envEntity.id,
              kind: 'reads_from',
              confidence: 'statically_resolved',
              location: envLoc,
              notes: `Reads environment variable ${envVarName}`,
            });
          }
        }
      }

      ts.forEachChild(node, visitCallsAndReferences);
    };

    visitCallsAndReferences(sourceFile);

    return {
      fileEntity,
      entities,
      relationships,
      imports,
      exports,
      warnings,
      unresolvedCalls,
    };
  }

  private getScriptKind(filePath: string): ts.ScriptKind {
    const ext = filePath.toLowerCase();
    if (ext.endsWith('.tsx')) return ts.ScriptKind.TSX;
    if (ext.endsWith('.ts')) return ts.ScriptKind.TS;
    if (ext.endsWith('.jsx')) return ts.ScriptKind.JSX;
    if (ext.endsWith('.js') || ext.endsWith('.mjs') || ext.endsWith('.cjs')) return ts.ScriptKind.JS;
    return ts.ScriptKind.Unknown;
  }
}

function hasExportModifier(node: ts.Node): boolean {
  if (ts.canHaveModifiers(node)) {
    const modifiers = ts.getModifiers(node);
    return !!(modifiers && modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
  }
  return false;
}

function hasDefaultModifier(node: ts.Node): boolean {
  if (ts.canHaveModifiers(node)) {
    const modifiers = ts.getModifiers(node);
    return !!(modifiers && modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword));
  }
  return false;
}
