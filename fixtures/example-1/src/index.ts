const property = (target: any, key: string) => { }

class Foo {
  @property
  bar: Foo[] | null;
}

class Bar {
  @property
  plop: number;
}
