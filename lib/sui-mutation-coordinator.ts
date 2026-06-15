const shipmentMutationTails = new Map<string, Promise<void>>();

export async function runShipmentSuiMutation<T>(
  shipmentId: string,
  _label: string,
  work: () => Promise<T>
): Promise<T> {
  const previous = shipmentMutationTails.get(shipmentId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => current);
  shipmentMutationTails.set(shipmentId, tail);

  await previous.catch(() => undefined);

  try {
    return await work();
  } finally {
    release();
    void tail.finally(() => {
      if (shipmentMutationTails.get(shipmentId) === tail) {
        shipmentMutationTails.delete(shipmentId);
      }
    });
  }
}
