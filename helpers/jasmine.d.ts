/// <reference types="jasmine" />
declare namespace jasmine {
    function expect(spy: Function): jasmine.Matchers;
    function expect(actual: any): jasmine.Matchers;
}
