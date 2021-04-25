const property = (target: any, key: string) => { }

type lol = string;

class Foo {
  @property
  bar: lol;
}

class Bar {
  @property
  plop: number;
}
