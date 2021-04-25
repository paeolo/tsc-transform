import ts from 'typescript';
import {
  CustomTransformers
} from '../types'

export const getTransformers = (program: ts.Program, tranformers?: CustomTransformers): ts.CustomTransformers => {
  return {
    before: tranformers?.before?.map(value => value(program)),
    after: tranformers?.after?.map(value => value(program)),
    afterDeclarations: tranformers?.afterDeclarations?.map(value => value(program))
  }
}
