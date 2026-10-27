import { NavLink, useParams } from "react-router-dom";
import { formatDate } from "@/components/utils";
import { Icon } from "@/components/icons";
import RoundLoader from "@/components/loaders";

export function GraphLoaderCard() {
  return (
    <>
      <div class="mb-2">
        <div class="from-mirage-600/20 to-mirage-600/10 hover:shadow-primary-950/50 shadow-cod-800/20 relative z-0 mb-1.5 flex w-full -translate-x-px items-center overflow-hidden rounded-md border border-slate-950 bg-transparent from-10% text-sm shadow-2xs transition-transform duration-300 ease-out first:mt-2 hover:translate-x-0.75 hover:border-slate-900/40 hover:bg-linear-to-tl hover:shadow focus:outline-hidden">
          <div class="space-y-3">
            <div class="h-2 w-3/5 animate-pulse rounded-lg bg-slate-800/20"></div>
            <div class="h-2 w-4/5 animate-pulse rounded-lg bg-slate-800/20"></div>
            <div class="h-2 w-2/5 animate-pulse rounded-lg bg-slate-800/20"></div>
          </div>
        </div>
      </div>
    </>
  );
}

export interface SubpanelItem {
  id: string;
  label: string;
  description: string;
  ctime?: string;
  repo?: string;
}

interface SubpanelProps {
  showError: any;
  show: boolean;
  isLoading: boolean | undefined;
  setShow: () => void;
  isFavorite?: boolean;
  label: string;
  onClick: (hid: string) => void;
  items: SubpanelItem[];
  to: string;
  errorMessage?: string | null;
  showFavorite: boolean;
  detailTxt: string;
  isDatetime: boolean;
}

export default function Subpanel({
  showError,
  show,
  isLoading,
  setShow,
  label,
  onClick,
  items,
  to,
  errorMessage,
  isFavorite = false,
  showFavorite = true,
  detailTxt = "",
  isDatetime = true,
}: SubpanelProps) {
  const { hid } = useParams();
  return (
    <section className="group/section">
      <header
        class={`group/toggle border-mirage-400 group-hover/section:border-primary-350 z-50 flex cursor-pointer items-center border-b-2 py-0.5 pb-1 text-slate-700 transition-colors duration-500 ease-in-out`}
        onClick={setShow}
      >
        <p class="px-2 text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500 group-hover/toggle:text-slate-400 transition-all duration-300">
          {label}
        </p>
        {isLoading ? (
          <div class="mr-2  my-0.5 ml-auto">
            <RoundLoader className="h-4 w-4 border-slate-500" />
          </div>
        ) : (
          <Icon
            icon="chevron-down"
            className={
              `hover:text-primary-300 mr-1 ml-auto h-5 w-5 origin-center transform cursor-pointer text-slate-600 group-hover/toggle:text-slate-300 focus:outline-hidden ${!show && "rotate-180"}` +
              " transition-all duration-300"
            }
          />
        )}
      </header>
      {showError && show && !isLoading && (
        <>
          <p>
            {errorMessage?.length ? (
              <p class="px-2 text-sm text-slate-400/60">{errorMessage}</p>
            ) : (
              <>
                We ran into an error fetching your data. Please try refreshing
                the page, if this error continues to occur please{" "}
                <a href="#" class="text-primary-300">
                  file an issue
                </a>{" "}
                on github
              </>
            )}
          </p>
        </>
      )}

      <div
        class={`overflow-y-auto px-1.5 transition-all duration-200 ease-in ${show ? "h-full opacity-100" : "h-0 max-h-full"}`}
      >
        {items.map((item) => {
          console.log("ik", item);
          return (
            <NavLink
              key={item.id}
              to={`${to}/${item.id}`}
              className={({ isActive }) =>
                `from-mirage-600/20 to-mirage-600/10 hover:shadow-primary-950/50 shadow-cod-800/20 relative z-0 mb-1.5 flex w-full -translate-x-px items-center overflow-hidden rounded-md border border-slate-950 bg-transparent from-10% text-xs shadow-2xs transition-transform duration-300 ease-out first:mt-2 hover:translate-x-0.75 hover:border-slate-900/40 hover:bg-linear-to-tl hover:shadow focus:outline-hidden ${isActive ? "*:text-slate-350 from-mirage-600/20 to-mirage-600/10 hover:from-mirage-600/20! hover:to-mirage-600/10! translate-x-0 border-slate-900/40! bg-linear-to-tl from-10% shadow-none hover:translate-x-0! hover:border-slate-900/40! hover:bg-linear-to-tl" : "*:text-slate-500"} ${!showFavorite && ""}`
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    class={`group mb-0.5 flex w-full flex-col items-start p-2.5 pr-0 text-inherit`}
                  >
                    <p
                      class={`line-clamp-1 text-lg pb-1.5 border-slate-900 group-hover:border-slate-800 transition-colors duration-100 w-full leading-4 ${isActive ? "group-hover:text-slate-350 border-slate-950!" : "group-hover:text-slate-400"}`}
                    >
                      {item.label}
                    </p>
                    <p class="mb-0.5 line-clamp-3 h-full max-h-12 w-full overflow-clip pr-6 leading-4 wrap-break-word">
                      {item.description}
                    </p>
                    <p class="  text-left text-xs leading-none font-light w-full">
                      {isDatetime ? (
                        `Created ${formatDate(item.ctime)}`
                      ) : (
                        <span className="flex items-center w-full ">
                          <span
                            className={`${isActive && "bg-primary-350 text-slate-300 translate-x-0"} -translate-x-1 font-medium transition-all duration-300 p-0.5 rounded-xs px-1.5`}
                          >
                            {item?.repo ?? ""}
                          </span>
                          <Icon
                            icon="git-fork"
                            className={`w-4 h-4 text-slate-500 ml-auto mr-2 transition-colors duration-100 ${isActive && "text-primary-350!"}`}
                          />
                        </span>
                      )}
                    </p>
                  </div>
                  {showFavorite && (
                    <Icon
                      icon="star"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onClick(item.id);
                        1;
                      }}
                      className={`hover:text-primary-350! text- absolute right-0 ml-auto h-8 w-8 rounded border border-transparent p-1 text-slate-700 transition-colors duration-300 ${isFavorite ? "text-primary-300!" : "text-slate-700!"} link-active-${hid !== item.id}`}
                    />
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </section>
  );
}
