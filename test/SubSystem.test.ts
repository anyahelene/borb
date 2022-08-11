import SubSystem, { Dependency } from '../src/SubSystem';

jest.useFakeTimers();

describe('', () => {
    test('', async () => {
        const start = jest.fn(
            (sys: SubSystem<object>, dep: Dependency<object>) => {
                console.log(dep.name);
                dep.forEach((d) => {
                    console.log(d.toString(), d.isStarted());
                    expect(d.isStarted()).toBeTruthy();
                });
                return Promise.resolve();
            },
        );
        const milk = {
            name: 'milk',
            depends: [],
            start: start,
            api: {},
            revision: 0,
        };
        const rennet = {
            name: 'rennet',
            depends: ['milk'],
            start: start,
            api: {},
            revision: 0,
        };
        const cheese = {
            name: 'cheese',
            depends: ['milk', 'rennet'],
            start: start,
            api: {},
            revision: 0,
        };

        const obj = {};
        Dependency.setup(obj);
        await Promise.all([
            Dependency.register(milk),
            Dependency.register(cheese),
            Dependency.register(rennet),
        ]);
        expect(start).toHaveBeenCalledTimes(3);
        // expect(start.mock.calls[2][0].name).toBe("cheese");
        console.log('DONE');
    });
});
