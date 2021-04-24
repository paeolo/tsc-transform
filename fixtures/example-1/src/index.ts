const property = (target: any, key: string) => { }

class Foo {
  @property
  bar: [lat: string, lol: number];
}

class Bar {
  @property
  plop: number;
}
