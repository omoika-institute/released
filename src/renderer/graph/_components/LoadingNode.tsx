import HintTip from "@/components/Hint";

export default function LoadingNode({ entity, warn = true }: { entity: any; warn?: boolean }) {
  if (warn) {
    console.warn(
      "Missing blueprint! Unable to find Python element definitions for: ",
      entity
    );
  }

  return (
    <>
      <HintTip
        hint={
          <>
            Please wait while we load the elements for this{" "}
            {entity.data?.label ? (
              <>
                '<b className="font-semibold">{entity.data.label}</b>'
              </>
            ) : (
              <>
                '<b className="font-semibold">Unknown</b>'
              </>
            )}{" "}
            entity.
          </>
        }
      />
    </>
  );
}
