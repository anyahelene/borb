import { jsxAttribute } from '@babel/types';
import {
    Messaging,
    createMessaging,
    Message,
    Payload,
    Connection,
    BaseConnection,
} from '../src/Messaging';

const MyConnection = BaseConnection;
jest.useFakeTimers();

describe('Messaging', () => {
    test('route', async () => {
        const M = createMessaging();
        const sayHello = jest.fn(({ name }: { name: string }) =>
            Promise.resolve({ reply: `hello, ${name}` }),
        );
        M.route('hello', sayHello);
        M.route('throw', ({ err }: { err: string }) => {
            throw new Error(err);
        });
        const receive = jest.fn((res) => {
            console.log('RECEIVED REPLY:', res.reply);
        });
        await M.send({ name: 'World' }, 'hello').then(receive);
        const error = jest.fn((err) => console.log(err));
        await M.send({ name: 'World' }, 'goodbye').catch(error);
        await M.send({ err: 'hi!' }, 'throw').catch(error);
        expect(sayHello).toHaveBeenCalledTimes(1);
        expect(receive).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalledTimes(2);
        console.log('DONE');
    });
    test('to-connection', async () => {
        const M = createMessaging();
        const conn = new MyConnection(M, 'echo');
        const send = jest
            .spyOn(conn, 'deliverRemote')
            .mockImplementation((data: Message) => {
                console.log('Echo receive message', data);
                conn.deliverHost(M.reply(data, data.content));
                return Promise.resolve();
            });
        const receive = jest.fn((res) => {
            console.log('RECEIVED REPLY:', res);
        });
        const p = M.send({ data: 'some data' }, 'say it', 'echo');
        jest.runAllTicks();
        await p.then(receive);
        expect(receive).toHaveBeenCalledTimes(1);
        console.log('DONE');
    }, 1000);
    test('from-connection', async () => {
        const M = createMessaging();
        let received_data;
        const sayHello = jest.fn(({ name }: { name: string }) =>
            Promise.resolve({ reply: `hello, ${name}` }),
        );
        M.route('hello', sayHello);
        M.route('throw', ({ err }: { err: string }) => {
            //  throw new Error(err);
            return Promise.reject(new Error());
        });
        const conn = new MyConnection(M, 'test');
        const send = jest.spyOn(conn, 'deliverRemote');
        await conn.deliverHost({
            header: { msg_type: 'hello', msg_id: '42' },
            content: { name: 'connection' },
        });

        await conn.deliverHost({
            header: { msg_type: 'throw', msg_id: '69' },
            content: { err: 'oops' },
        });

        jest.runAllTimers();

        expect(send).toHaveBeenCalled();
        expect(send.mock.calls[0]).toBeDefined();
        expect(send.mock.calls[0][0].header.msg_type).toBe('hello_reply');
        expect(send.mock.calls[0][0].header.ref_id).toBe('42');
        expect(send.mock.calls[0]).toBeDefined();
        console.log(conn.queue);
        expect(send.mock.calls[1][0].header.msg_type).toBe('error_reply');
        expect(send.mock.calls[1][0].header.ref_id).toBe('69');
        expect(send).toHaveBeenCalledTimes(2);
        expect(sayHello).toHaveBeenCalledTimes(1);
        console.log('DONE');
    }, 1000);
});
