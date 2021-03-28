import assert from 'assert';
import {
  IPeople
} from 'example-2';

assert(1 + 1 === 2);
console.log('Hello world!!');

const foo = (people: IPeople) => console.log(people.foo);
