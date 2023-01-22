# RWRVEE

Configurable & fast deterministic online recommendation system for in-memory tabular data that can be represented as a virtual bipartite graph. We use simulatity of embedded vectors to combind both the structural similarities of the network as well as the similarities between edge vectors. Designed to be resistant to cold-start and data sparsity problems.

This recommender algorithm is designed to work on SQL-like table outputs (for example a "Review" table) where foreign keys represent links between a target node type (users) and the items to make recommendations on. It can support any number of additional node types as long as the graph is bipartite and the only edges that exist are between the target node type and the additional node types.

If we consider an in-context example, this algorithm was designed for MiddCourses, a course review site. We define our graph from the "Review" table and have 3 distinct node types (users, courses, instructors). The graph is structured from the foreign keys on each review row such that we have edges between users and courses and also between users and instructors. Along those edges, we embed values from the review as our vectors. Users are our target node type and we make course recommendations.

Recsys network algorithm designed to return a configurable node neighborhood for nodes of a given type on a bipartite graph.
