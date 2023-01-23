import seedrandom from 'seedrandom';
import { randomUniformItem, randomWeightedItem } from './randomUtils.js';

type INodeId = string;
type INodeType = string;
type IEntranceIndex = number;

type IColumnName = string;
type IColumnTypes = 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array' | 'null' | 'undefined';
type IDataTypes = string | number | boolean | Date | object | any[] | null | undefined;

interface INode {
    id: INodeId;
    type: INodeType;
    entranceIndex?: IEntranceIndex;
}


type IDataIndex = number;
type IData = Record<string, IDataTypes>;
interface IRandomWalkMapping extends Map<string, IDataIndex[]> { }
interface IRandomWalkData extends Array<IData> { }


interface IVectorConfig {
    // fields: Record<IColumnName, IColumnTypes>;
    fields: IColumnName[];
}

interface INodesConfig extends Record<string, {
    type: INodeType;
    idColumn: IColumnName;
    ratingColumn?: IColumnName;
    // vector: IVectorConfig; // Vectors need to be on edge configs not node configs!!!
    // connectsTo: INodeType[];
}> { }


interface IEdgeConfig extends Record<string, {
    source: INodeType;
    destination: INodeType;
    vector: IVectorConfig;
}> { }


// describe the shape of the data
interface IDataConfig {
    columns: string[];
    nodeTypes: INodesConfig;
    edges: IEdgeConfig;
}



interface IRandomWalkConfig {
    maxIterations: number;
    maxRecommendations: number;
    maxTargetNeighbours: number;
    restartProbability: number;
    seed: string;

    standardize?: boolean;

    recommendationType: INodeType;

    neighborFilter: (id: INodeId, count: number) => boolean;
    itemFilter: (id: INodeId, item: {
        unweighted_count: number,
        weighted_count: number,
        sum: number
    }) => boolean;
    targetNeighbourhoodThreshold: number;
    // recommendationFilter: (recommendation: IRecommendation) => boolean;

    vectorSimilarity: (vector1: number[], vector2: number[]) => number;
    activationFunction: (value: number) => number;
    // edgeProbability: (source: INode, target: INode) => number;
    // singularRowValue: (row: IData) => number;


    dataConfig: IDataConfig;

}


interface ITargetConfig {
    id: INodeId;
    type: INodeType;
}

export interface IRandomWalk {
    config: IRandomWalkConfig;
    target: ITargetConfig;
    data: IRandomWalkData;
    mappings: Record<string, IRandomWalkMapping>;
}



// Consider pruning the maps where degree of array is 1 (dead ends)



export function computeMappings(data: IRandomWalkData, dataConfig: IDataConfig): Record<string, IRandomWalkMapping> {
    const mappings: Record<string, IRandomWalkMapping> = {};

    for (const nodeType in dataConfig.nodeTypes) {
        const mapping = new Map<string, IDataIndex[]>();
        const idColumn = dataConfig.nodeTypes[nodeType].idColumn;
        data.forEach((row, rowIndex) => {
            const id = row[idColumn] as INodeId;
            const rowIndices = mapping.get(id) || [];
            rowIndices.push(rowIndex);
            mapping.set(id, rowIndices);
        });
        mappings[nodeType] = mapping;
    }

    return mappings;
}





// export function standardizeData(data: IRandomWalkData, dataConfig: IDataConfig): IRandomWalkData {

//     const vectorFields = Object.values(dataConfig.edges).reduce((fields, edge) => {
//         return fields.concat(edge.vector.fields);
//     }, [] as IColumnName[]);

//     const vectorFieldIndices = vectorFields.map((field) => dataConfig.columns.indexOf(field));

//     const standardizedData = data.map((row) => {
//         const newRow = { ...row };
//         vectorFieldIndices.forEach((fieldIndex) => {
//             newRow[dataConfig.columns[fieldIndex]] = (newRow[dataConfig.columns[fieldIndex]] as number) / 100;
//         });
//         return newRow;
//     });

//     return standardizedData;



// }



function getNeighborRowIndices(node: INode, mapping: IRandomWalkMapping): number[] {
    const neighborRowIndices = mapping.get(node.id) as number[] || [];
    return neighborRowIndices.filter((rowIndex) => (rowIndex !== node.entranceIndex));
}


function softmax(values: number[]): number[] {
    const max = Math.max(...values);
    const exp = values.map((value) => Math.exp(value - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    return exp.map((value) => value / sum);
}



interface IDataIndexProbability {
    index: IDataIndex;
    probability: number;
}

function getNeighborProbabilities(
    node: INode,
    neighborRowIndices: IDataIndex[],
    data: IRandomWalkData,
    config: IRandomWalkConfig): IDataIndexProbability[] {

    const neighborProbabilities: IDataIndexProbability[] = [];

    if (neighborRowIndices.length === 0) {
        return neighborProbabilities;
    }

    if (neighborRowIndices.length === 1) {
        neighborProbabilities.push({
            index: neighborRowIndices[0],
            probability: 1
        });
        return neighborProbabilities;
    }


    const vectorKeys = config.dataConfig.edges[node.type].vector.fields as IColumnName[];

    const neighborVectors: number[][] = neighborRowIndices.map((rowIndex) => {
        const row = data[rowIndex];
        return vectorKeys.map((key) => row[key] as number);
    });


    const targetData = data[node.entranceIndex as number];
    const targetVector = vectorKeys.map((key) => targetData[key] as number);

    const vectorSimilarity = neighborVectors.map((neighborVector, index) => {
        return { value: config.vectorSimilarity(targetVector, neighborVector), index };
    });


    const filteredSimilarity = vectorSimilarity
        .filter((similarity) => (similarity.value > 0))
        .map((similarity => ({ value: config.activationFunction(similarity.value), index: similarity.index })));

    const softmaxSimilarity = softmax(filteredSimilarity.map((similarity) => similarity.value));

    return softmaxSimilarity.map((probability, index) => {
        return {
            index: neighborRowIndices[filteredSimilarity[index].index],
            probability
        };
    });
}




export function rwrvee({ config, target, data, mappings = {} }: IRandomWalk) {

    const rng = seedrandom(config.seed);

    const targetNode: INode = {
        id: target.id,
        type: target.type,
        entranceIndex: undefined
    }

    console.log('targetNode', targetNode);

    const visitedNeighboursCount = new Map<INodeId, number>();
    let current: INode = Object.assign({}, targetNode);

    /* Find the target's type neighborhood */
    let iteration = 0;
    while (iteration <= config.maxIterations) {
        iteration++;

        // if (iteration % 100 === 0) {
        // console.log(`Iteration ${iteration}`)
        // console.log(`Current node: ${current.id} (${current.type})`)
        // }


        if (current.id !== target.id) {

            if (current.type === target.type) {
                visitedNeighboursCount.set(current.id, (visitedNeighboursCount.get(current.id) || 0) + 1);
            }

            /* Randomly restart */
            if (rng.quick() < config.restartProbability) {
                current = Object.assign({}, targetNode);
                continue;
            }

        }

        switch (current.type) {

            case target.type: {

                /* Select a random neighbor */
                const neighbors = getNeighborRowIndices(current, mappings[current.type]);

                if (!neighbors) {
                    if (current.id === target.id) {
                        throw new Error(`Target node ${target.id} has no neighbors`);
                    }
                    /* Force restart */
                    current = Object.assign({}, targetNode);
                    continue;
                }

                const neighborIndex = randomUniformItem(neighbors, rng.quick);
                const neighbor = data[neighborIndex];

                if (!neighbor) {
                    /* Force restart */
                    current = Object.assign({}, targetNode);
                    continue;
                }

                const nodeTypes: INodeType[] = [];
                for (const item of Object.values(config.dataConfig.nodeTypes)) {
                    if (neighbor.hasOwnProperty(item.idColumn) && neighbor[item.idColumn] !== null) {
                        nodeTypes.push(item.type);
                    }
                }


                const selectedType = randomUniformItem(nodeTypes, rng.quick);

                current = {
                    id: neighbor[config.dataConfig.nodeTypes[selectedType].idColumn] as INodeId,
                    type: selectedType,
                    entranceIndex: neighborIndex
                };

                continue;

            }

            default: {

                /* Select a random neighbor */
                const neighbors = getNeighborRowIndices(current, mappings[current.type]);
                const neighborProbabilites = getNeighborProbabilities(current, neighbors, data, config);

                if (neighborProbabilites.length === 0) {
                    /* Force restart */
                    console.log("No neighbors found. Forcing restart");
                    current = Object.assign({}, targetNode);
                    continue;
                }

                const neighborIndex = randomWeightedItem(
                    neighborProbabilites.map((neighbor) => neighbor.index),
                    neighborProbabilites.map((neighbor) => neighbor.probability),
                    rng.quick
                );

                const neighbor = data[neighborIndex];

                if (!neighbor) {
                    // throw new Error(`Neighbor ${neighborIndex} not found`);
                    /* Force restart */
                    console.log(`Neighbor ${neighborIndex} not found. Forcing restart`);
                    current = Object.assign({}, targetNode);
                    continue;
                }


                current = {
                    id: neighbor[config.dataConfig.nodeTypes[target.type].idColumn] as INodeId,
                    type: target.type,
                    entranceIndex: neighborIndex
                };

                continue;
            }
        }
    }

    const recommendations = new Map<INodeId, {
        unweighted_count: number,
        weighted_count: number,
        sum: number
    }>();

    const targetNeighborhood = Array
        .from(visitedNeighboursCount.entries())
        .filter(([_, count]) => count > config.targetNeighbourhoodThreshold)
        .filter((neighbor) => config.neighborFilter(neighbor[0], neighbor[1]))
        .sort((a, b) => b[1] - a[1])
        .slice(0, config.maxTargetNeighbours);

    console.log('targetNeighborhood', targetNeighborhood);

    targetNeighborhood.forEach(([entry, count]) => {

        const targetItems = (mappings[target.type]
            .get(entry) || [])
            .map((item) =>
                data[item][config.dataConfig.nodeTypes[config.recommendationType].idColumn] as INodeId);

        targetItems.forEach((id, index) => {
            const { unweighted_count, weighted_count, sum } = recommendations.get(id) || {
                unweighted_count: 0,
                weighted_count: 0,
                sum: 0
            };

            // const targetRatingValue = data[target.entranceIndex as number][config.dataConfig.nodeTypes[target.type].ratingColumn] as number;
            // const targetRatingValue = config.singularRowValue(data
            const targetIndices = (mappings[target.type].get(entry) || []) as IDataIndex[];
            const targetRatingValue = data[targetIndices[index]][config.dataConfig.nodeTypes[config.recommendationType].ratingColumn as string] as number;


            recommendations.set(id, {
                unweighted_count: unweighted_count + 1,
                weighted_count: weighted_count + count,
                sum: sum + (targetRatingValue * count)
            });
        });
    });

    const targetIndices = (mappings[target.type].get(target.id) || []) as IDataIndex[];
    const targetItemAlreadyRated = new Set<INodeId>(targetIndices
        .map((index) => data[index][config.dataConfig.nodeTypes[config.recommendationType].idColumn] as INodeId));

    console.log("recommendations:", recommendations);

    const sortedRecommendations: INodeId[] = Array
        .from(recommendations.entries())
        .filter(([id, _]) => !targetItemAlreadyRated.has(id))
        .filter(([id, obj]) => config.itemFilter(id, obj))
        // some other filter logic
        .map(([id, {
            unweighted_count,
            weighted_count,
            sum
        }]) => ({
            id,
            avg: sum / weighted_count,
        }))
        .sort((a, b) => b.avg - a.avg)
        .slice(0, config.maxRecommendations)
        .map((item) => item.id);

    console.log('sortedRecommendations', sortedRecommendations);

    return sortedRecommendations;

}