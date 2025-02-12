export function isOneUndefined(
    arg1: any,
    arg2: any
): boolean {
    const undefined1 = arg1 === undefined;
    const undefined2 = arg2 === undefined;

    if (undefined1 === undefined2) {
        throw new Error('Specify either arg1 or arg2, but not both');
    }

    return undefined1;
}