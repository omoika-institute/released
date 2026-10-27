import { memo } from "preact/compat";
import { Icon } from "@/components/icons";

export type PluginEntity = {
  label: string;
  description?: string;
  author?: string | string[];
  icon?: string;
  color?: string;
  category?: string;
  categories?: string[];
};

const resolveIcon = (value?: string) => (value && value.trim() ? value : "");
const resolveColor = (value?: string) => (value && value.trim() ? value : "");

export const EntityOption = memo(
  ({ entity, onDragStart }: { entity: PluginEntity; onDragStart: any }) => {
    const entityColor = resolveColor(entity.color) || "#838B64";
    const entityIcon = resolveIcon(entity.icon) || "atom-2";
    return (
      <>
        <li
          key={entity.label}
          className="flex w-full items-center justify-between pb-2.5"
        >
          <div
            draggable
            onDragStart={(event) => onDragStart(event, entity.label)}
            style={{ borderLeftColor: entityColor }}
            className="relative flex max-h-40 w-full min-w-48 cursor-grab items-center justify-between overflow-hidden rounded-sm border border-l-4 border-subtle  p-2 text-sm backdrop-blur-xs transition-all duration-150 hover:-translate-y-px hover:border-subtle active:cursor-grabbing focus:outline-hidden"
          >
            <div className="flex w-full flex-col select-none">
              <div className="flex w-full items-start relative justify-between gap-x-3">
                <div className="flex items-center gap-2 relative w-full">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-sm absolute right-0"
                    style={{ color: entityColor }}
                  >
                    <Icon icon={entityIcon} className="h-4 w-4" />
                  </span>
                  <p className="text-sm leading-6 font-semibold whitespace-nowrap text-primary-txt select-none">
                    {entity.label}
                  </p>
                </div>
              </div>
              <div className="flex flex-col text-xs leading-5 text-muted-txt">
                <p className="line-clamp-3 gap-x-2 truncate leading-5 whitespace-normal text-secondary-txt">
                  {entity.description || "No description provided."}
                </p>
                <br />
                <p className="flex items-center truncate text-xs leading-5 text-muted-txt">
                  Created by {entity.author ? entity.author : "unknown"}
                </p>
              </div>
            </div>
          </div>
        </li>
      </>
    );
  },
);
