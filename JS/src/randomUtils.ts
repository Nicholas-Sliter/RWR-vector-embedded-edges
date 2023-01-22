export const randomUniformItem = <T>(array: T[], randomFunction: Function) => {
    const index = Math.floor(array.length * randomFunction());
    return array[index];
};


export const randomWeightedItem = <T>(
    array: T[],
    distribution: number[],
    randomFunction: Function
) => {

    if (array.length !== distribution.length) {
        throw new Error(`Array and distribution must be the same length`);
    }

    if (distribution.length === 0) {
        throw new Error(`Array and distribution must have at least one element`);
    }

    if (distribution.length === 1) {
        return array[0];
    }

    const cdf: number[] = [];
    distribution.forEach((p, index) => {
        if (index === 0) {
            cdf.push(p);
        } else {
            cdf.push(p + cdf[index - 1]);
        }
    });

    const randomValue = randomFunction();
    const index = cdf.findIndex(value => value >= randomValue);

    if (index === -1) {
        return array[array.length - 1];
    }

    return array[index];

};
