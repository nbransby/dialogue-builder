//add jasmine's expect to the jasmine namespace as it collides with dialog builder's expect

declare namespace jasmine {
    function expect(spy: Function): jasmine.Matchers;
    function expect(actual: any): jasmine.Matchers;
}

jasmine.expect = expect;