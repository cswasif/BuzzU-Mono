interface PagesFunction {
    (context: { request: Request; env: any; next: () => Promise<Response>; params: any; data: any }): Promise<Response>;
}

export const onRequestPost: PagesFunction = async (context: any) => {
    const formData = await context.request.formData();
    const credential = formData.get('credential');

    if (credential) {
        // Redirect back to the same page but with the token in the hash fragment
        // This allows the SPA to read the token without any server-side tracking/storage
        const url = new URL(context.request.url);
        url.hash = `token=${credential}`;

        return Response.redirect(url.toString(), 303);
    }

    // Fallback: If no credential, just redirect to the verification page normally
    return Response.redirect(new URL('/verify', context.request.url).toString(), 302);
};

// For GET requests, we let the static content be served
export const onRequestGet: PagesFunction = async (context: any) => {
    return context.next();
};
