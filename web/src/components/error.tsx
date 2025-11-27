export default function Failed({ page, error }: { page: string; error: string; }) {
    return (
        <div className="flex flex-col items-center justify-center">
            <h1 className="text-3xl error">An error occurred loading {page}!</h1>
            <div className="mt-4 error" style={{ marginTop: '20px' }}>
                <p className="text-lg">{error}</p>
            </div>
            <button onClick={() => window.location.reload()}>
                Try Again
            </button>
        </div>
    );
};