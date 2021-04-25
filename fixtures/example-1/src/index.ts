const property = (target: any, key: string) => { }

class Foo {
  @property
  bar: string | null;
}

class Bar {
  @property
  plop: number;
}
