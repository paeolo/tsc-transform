import ts from 'typescript';
import { codeFrameColumns } from '@babel/code-frame';

export const formatDiagnostic = (diagnostic: ts.Diagnostic) => {
  const message = ts.flattenDiagnosticMessageText(
    diagnostic.messageText, "\n"
  );

  const sourcePath = diagnostic.file!.fileName;

  if (!diagnostic.file || !diagnostic.start) {
    return message;
  }

  const pos = diagnostic
    .file
    .getLineAndCharacterOfPosition(diagnostic.start);

  const line = pos.line + 1;
  const column = pos.character + 1;
  const location = { start: { line, column } };

  const codeFrame = codeFrameColumns(diagnostic.file.text, location, { highlightCode: true });

  const source = `${sourcePath}:${line}:${column}`;

  return source
    .concat(' - ')
    .concat(message)
    .concat('\n')
    .concat('\n')
    .concat(codeFrame);
}
