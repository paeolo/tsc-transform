import { LOL } from './lol'

const property = (target: any, key: string) => { }

export enum TestEnum {
  FIRST = 'FIRST',
  SECOND = 'SECOND'
}

class Foo {
  @property
  bar: TestEnum;
}

class Bar {
  @property
  plop: number;
}
