// Run using Deno:
//   $ deno run promises.ts

// DO NOT TOUCH THIS CODE BELOW

type DeleteRequest = () => Promise<string>;

const maxInFlight = 10;
const inFlight = new Set<number>();

function monitorInFlight(signal: AbortSignal) {
  const interval = setInterval(() => {
    if (signal.aborted) {
      return clearInterval(interval);
    }

    const ids: number[] = [];
    inFlight.forEach(id => {
      ids.push(id);
    });

    console.log(`In-flight requests: [${ids}] (${ids.length} total)`);
  }, 100);
}

function deleteItem(id: number) {
  inFlight.add(id);

  const roundTripTime = Math.floor(Math.random() * 1000);

  return new Promise<string>(
    (resolve, reject) =>
      setTimeout(() => {
        if (inFlight.size > maxInFlight) {
          reject("Too many in-flight requests");
        } else {
          console.log(`${id} success after ${roundTripTime}ms`);
          resolve(`${id} success after ${roundTripTime}ms`);
        }

        inFlight.delete(id);
      }, roundTripTime),
  );
}

const bulkDeleteQuantity = 100;
const idsToDelete = new Array(bulkDeleteQuantity).fill(0).map((_, i) => i);

// DO NOT TOUCH THIS CODE ABOVE

// START CODING BELOW

// bulkDelete accepts an array of ids and will call `deleteItem()` for each
// one and returns a promise that resolves only after each `deleteItem()` has
// resolved. If any of the `deleteItem()` promises are rejected, then this
// function will return a rejected promise.
//
// The server has a rate limit of 10 max requests at a time. The server will
// reject any incoming requests if there are already 10 in-flight.

/**
 * A naive solution to this problem is to split up the list of
 * IDs into batches of 10 and execute each batch sequentially.
 * The main flaw with this approach is that we must wait until
 * all 10 of the items in the current batch have succeeded until
 * we can start processing items from the next batch. If one item
 * takes 1 minute while the other items only take 1 second, we
 * are wasting a full 59 seconds waiting for that last item to
 * complete.
 *
 * Even though it is naive, it can be tricky to figure out
 * how to execute promises recursively while waiting (since
 * JavaScript has no `sleep()` function), so it ensures the
 * candidate has more than a surface level understanding of
 * the async nature of the JavaScript runtime.
 */
function _bulkDeleteNaiveBatch(ids: number[]): Promise<string> {
  const requests = ids.map((id) => () => deleteItem(id));

  const batches = requests.reduce(
    (batches, request, index) => {
      const batchIndex = index % maxInFlight;
      const batch = batches.get(batchIndex);

      if (batch === undefined) {
        batches.set(batchIndex, [request]);

        return batches;
      }

      const newBatch = batch.concat([request]);
      batches.set(batchIndex, newBatch);

      return batches;
    },
    new Map<number, DeleteRequest[]>(),
  );

  const sendBatch = (batchIndex: number): Promise<string> => {
    const batch = batches.get(batchIndex)!;
    const nextBatch = batches.get(batchIndex + 1);

    const executedBatch = batch.map((request) => request());

    if (nextBatch === undefined) {
      return Promise.all(executedBatch).then(() => "success");
    }

    return Promise.all(executedBatch).then(() => sendBatch(batchIndex + 1));
  };

  return sendBatch(0);
}

/**
 * The expert solution is to use a queue to manage the in-flight
 * requests, and keep the queue full in order to always have the
 * maximum number of requests in-flight, reducing the total time
 * needed to complete the bulk delete.
 */
function _bulkDeleteExpertQueue(ids: number[]): Promise<string> {
  const pile = [...ids];

  const worker = (workerID: string): Promise<void> => {
    console.log("worker", workerID, "running");

    const item = pile.pop();

    if (item === undefined) {
      console.log("worker", workerID, "shutting off");

      return Promise.resolve();
    }

    console.log("worker", workerID, `deleting ${item}`);

    return deleteItem(item).then(() => {
      console.log("worker", workerID, `deleted ${item}`);

      return worker(workerID);
    });
  };

  const workers = new Array(maxInFlight).fill(0).map(() =>
    worker(crypto.randomUUID())
  );

  return Promise.all(workers).then(() => "success");
}

class CustomAbortController {
  constructor(public signal = { aborted: false } as AbortSignal) {}

  abort() {
    this.signal = { aborted: true } as AbortSignal;
  }
}


const inFlightMonitor = "AbortController" in window ? new AbortController() : new CustomAbortController();
monitorInFlight(inFlightMonitor.signal);

const start = Date.now();

_bulkDeleteNaiveBatch(idsToDelete)
  .then(() => {
    inFlightMonitor.abort();

    const end = Date.now();
    const totalElapsedTime = Math.floor(end - start);

    console.log(`============== COMPLETE ==============`);
    console.log(`Total time: ${totalElapsedTime}ms`);
    console.log(`============== COMPLETE ==============`);
  })
  .catch((error) => {
    inFlightMonitor.abort();

    console.error(error)
  });
