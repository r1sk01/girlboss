import LoadingIcon from "./loading-icon";

export default function Loading({ page }: { page: string }) {
    return (
        <div className="flex flex-col items-center justify-center">
            <h1 className="text-3xl">Loading {page}...</h1>
            <div className="mt-4" style={{ marginTop: '20px' }}>
                <LoadingIcon />
            </div>
        </div>
    );
};